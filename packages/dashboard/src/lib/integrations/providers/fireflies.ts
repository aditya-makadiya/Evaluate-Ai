/**
 * Fireflies provider adapter.
 *
 * API-key auth + GraphQL ingestion. v2 sync iterates every active
 * user_integration in the team (Fireflies is per-attendee — each user only
 * sees meetings they attended — so the only way to get the team's full
 * meeting surface is to union across tokens). Dedup is `ON CONFLICT`
 * semantics via a check-then-insert pattern keyed on
 * (team_id, external_id).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProviderAdapter } from '../provider';
import type {
  ExternalAccount,
  SyncContext,
  SyncResult,
  TokenBundle,
} from '../types';
import { getSupabaseAdmin } from '../../supabase-server';
import {
  decryptAccessToken,
  markIntegrationStatus,
} from '../user-integrations';
import { updateJobProgress } from '../sync-jobs';
import { resolveFirefliesParticipant } from '../attribution';
import { logIntegration } from '../logger';

const GRAPHQL_URL = 'https://api.fireflies.ai/graphql';
const BACKFILL_MS = 30 * 24 * 60 * 60 * 1000;

interface FirefliesUser {
  name: string | null;
  user_id: string | null;
}

interface FirefliesTranscript {
  id: string;
  title: string;
  date: string;
  duration: number;
  organizer_email?: string;
  participants?: string[];
  sentences?: Array<{ speaker_name: string; text: string; start_time: number; end_time: number }>;
  summary?: {
    overview?: string;
    action_items?: string[] | string;
    shorthand_bullet?: string[] | string;
    short_summary?: string;
    keywords?: string[];
  };
}

async function queryFirefliesUser(apiKey: string): Promise<FirefliesUser> {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query: `query { user { name user_id } }` }),
  });
  const text = await res.text();
  let parsed: { data?: { user?: FirefliesUser | null }; errors?: Array<{ message?: string }> };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Fireflies API returned non-JSON (HTTP ${res.status})`);
  }
  if (!res.ok || parsed.errors) {
    throw new Error(`Fireflies API: ${parsed.errors?.[0]?.message ?? `HTTP ${res.status}`}`);
  }
  const user = parsed.data?.user;
  if (!user?.user_id) throw new Error('Fireflies did not return a user identity');
  return user;
}

async function fetchRecentTranscripts(
  apiKey: string,
  fromDate: string,
  limit = 50
): Promise<FirefliesTranscript[]> {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      query: `
        query RecentTranscripts($fromDate: DateTime, $limit: Int) {
          transcripts(fromDate: $fromDate, limit: $limit) {
            id
            title
            date
            duration
            organizer_email
            participants
            sentences { speaker_name text start_time end_time }
            summary {
              overview
              action_items
              shorthand_bullet
              short_summary
              keywords
            }
          }
        }
      `,
      variables: { fromDate, limit },
    }),
  });

  const data = await res.json();
  if (data.errors) {
    throw new Error(data.errors[0]?.message ?? 'Fireflies API error');
  }
  return (data?.data?.transcripts ?? []) as FirefliesTranscript[];
}

/**
 * Insert a single meeting row, attribute participants, extract tasks. Same
 * data shape as the legacy fireflies/sync route (intentionally — dashboards
 * query on these columns). Returns whether we inserted (true) or the meeting
 * was a duplicate (false).
 */
async function processMeeting(
  admin: SupabaseClient,
  teamId: string,
  transcript: FirefliesTranscript
): Promise<{ inserted: boolean; tasksCount: number; error?: string }> {
  const { data: existing } = await admin
    .from('meetings')
    .select('id')
    .eq('external_id', transcript.id)
    .eq('team_id', teamId)
    .maybeSingle();
  if (existing) return { inserted: false, tasksCount: 0 };

  const { data: teamMembers } = await admin
    .from('team_members')
    .select('id, name, email')
    .eq('team_id', teamId);
  const members = (teamMembers ?? []) as Array<{ id: string; name: string | null; email: string | null }>;

  // Attribution preference (Phase 4):
  //   1. If this participant IS the organizer, match by organizer_email (deterministic)
  //   2. Fall back to the existing fuzzy name match
  // The organizer-by-email match only applies to participants whose name
  // corresponds to the organizer; other participants still go through name
  // matching because Fireflies doesn't expose per-participant emails in the
  // transcripts query.
  const organizerEmail = transcript.organizer_email?.toLowerCase().trim() ?? null;
  const organizerMemberId = organizerEmail
    ? (members.find((m) => (m.email ?? '').toLowerCase().trim() === organizerEmail)?.id ?? null)
    : null;

  const participants = (transcript.participants ?? []).map((name) => {
    // Heuristic: if a participant's name maps plausibly to the organizer's
    // email, prefer that deterministic id. Otherwise fuzzy-match.
    let matchedId: string | null = null;
    if (organizerMemberId) {
      const organizerMember = members.find((m) => m.id === organizerMemberId);
      if (organizerMember?.name) {
        const normalized = name.toLowerCase().trim();
        const organizerName = organizerMember.name.toLowerCase();
        if (
          organizerName === normalized ||
          organizerName.split(' ')[0] === normalized.split(' ')[0]
        ) {
          matchedId = organizerMemberId;
        }
      }
    }
    if (!matchedId) {
      matchedId = resolveFirefliesParticipant(members, { name });
    }
    return { name, member_id: matchedId };
  });

  const transcriptText = transcript.sentences
    ? transcript.sentences.map((s) => `${s.speaker_name}: ${s.text}`).join('\n')
    : '';
  const durationMinutes = transcript.duration ? Math.round(transcript.duration / 60) : null;

  const summaryParts: string[] = [];
  if (transcript.summary?.overview) summaryParts.push(transcript.summary.overview);
  if (transcript.summary?.shorthand_bullet?.length) {
    const bullets = transcript.summary.shorthand_bullet;
    summaryParts.push(
      typeof bullets === 'string'
        ? '\n**Key Points:**\n' + bullets
        : '\n**Key Points:**\n' + bullets.map((b) => `• ${b}`).join('\n')
    );
  }
  const richSummary = summaryParts.length > 0 ? summaryParts.join('\n') : null;

  const metadata: Record<string, unknown> = {};
  if (transcript.summary?.keywords?.length) metadata.keywords = transcript.summary.keywords;
  if (transcript.summary?.action_items?.length) metadata.fireflies_action_items = transcript.summary.action_items;
  if (transcript.summary?.short_summary) metadata.short_summary = transcript.summary.short_summary;

  const { data: meeting, error: meetingError } = await admin
    .from('meetings')
    .insert({
      team_id: teamId,
      external_id: transcript.id,
      title: transcript.title ?? 'Untitled Meeting',
      date: transcript.date ? new Date(transcript.date).toISOString() : new Date().toISOString(),
      duration_minutes: durationMinutes,
      participants,
      transcript: transcriptText,
      summary: richSummary,
      source: 'fireflies',
      action_items_count: 0,
      metadata: Object.keys(metadata).length > 0 ? metadata : null,
      created_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (meetingError || !meeting) {
    return {
      inserted: false,
      tasksCount: 0,
      error: `meeting insert: ${meetingError?.message ?? 'unknown'}`,
    };
  }

  for (const p of participants) {
    if (!p.member_id) continue;
    await admin.from('activity_timeline').insert({
      team_id: teamId,
      developer_id: p.member_id,
      event_type: 'meeting',
      title: `Meeting: ${transcript.title ?? 'Untitled'}`,
      description: transcript.summary?.overview
        ? transcript.summary.overview.slice(0, 300)
        : `${durationMinutes ?? '?'}min meeting with ${participants.length} participants`,
      metadata: {
        meeting_id: meeting.id,
        external_id: transcript.id,
        duration_minutes: durationMinutes,
        participants_count: participants.length,
        source: 'fireflies',
      },
      source_id: meeting.id,
      source_table: 'meetings',
      occurred_at: transcript.date ? new Date(transcript.date).toISOString() : new Date().toISOString(),
    });
  }

  // Task extraction (AI + Fireflies fallback) — keep same behavior as legacy
  let tasksCount = 0;
  try {
    const { extractTasksFromTranscript, persistExtractedTasks } = await import(
      '../../services/task-extractor'
    );
    let extracted: Awaited<ReturnType<typeof extractTasksFromTranscript>> = [];
    // Task extractor expects non-null name/email; filter incomplete rows out
    // rather than casting — attribution uses the full members list (null-safe).
    const membersWithContact = members
      .filter((m): m is { id: string; name: string; email: string } => !!m.name && !!m.email);
    if (transcriptText.length > 50) {
      extracted = await extractTasksFromTranscript(transcriptText, membersWithContact);
    }
    if (extracted.length === 0 && transcript.summary?.action_items?.length) {
      const raw = transcript.summary.action_items;
      const list = typeof raw === 'string'
        ? raw.split('\n').map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith('**'))
        : raw;
      extracted = list.map((item) => ({
        title: item.length > 200 ? item.slice(0, 200) : item,
        assignee: null,
        priority: 'medium' as const,
        deadline: null,
        description: null,
        project: null,
      }));
    }
    if (extracted.length > 0) {
      tasksCount = await persistExtractedTasks(meeting.id, teamId, extracted, membersWithContact);
    }
  } catch (err) {
    // Task extraction is fire-and-forget semantically; the meeting is
    // already inserted. Log and continue.
    console.error('Task extraction failed:', err);
  }

  return { inserted: true, tasksCount };
}

export const firefliesAdapter: ProviderAdapter = {
  slug: 'fireflies',
  displayName: 'Fireflies',
  authType: 'api_key',

  async validateApiKey(apiKey: string): Promise<{ token: TokenBundle; identity: ExternalAccount }> {
    const user = await queryFirefliesUser(apiKey);
    return {
      token: { accessToken: apiKey, refreshToken: null, expiresAt: null },
      identity: { id: user.user_id!, handle: user.name ?? user.user_id! },
    };
  },

  async fetchAccountIdentity(token: string): Promise<ExternalAccount> {
    const user = await queryFirefliesUser(token);
    return { id: user.user_id!, handle: user.name ?? user.user_id! };
  },

  async sync(ctx: SyncContext): Promise<SyncResult> {
    return runFirefliesSync(ctx);
  },
};

async function runFirefliesSync(ctx: SyncContext): Promise<SyncResult> {
  const admin = getSupabaseAdmin();
  const { teamId, jobId } = ctx;

  const { data: integrations, error } = await admin
    .from('user_integrations')
    .select('id, user_id, access_token_encrypted, last_sync_at')
    .eq('team_id', teamId)
    .eq('provider', 'fireflies')
    .eq('status', 'active');
  if (error) throw new Error(`fireflies sync: ${error.message}`);

  const total = integrations?.length ?? 0;
  let meetingsInserted = 0;
  let usersFailed = 0;
  const errors: string[] = [];

  for (let i = 0; i < (integrations?.length ?? 0); i++) {
    const row = integrations![i];
    const userIntegrationId = row.id as string;
    try {
      const token = decryptAccessToken({
        access_token_encrypted: (row as { access_token_encrypted: Buffer }).access_token_encrypted,
      });
      const fromDate = row.last_sync_at
        ? new Date(row.last_sync_at as string).toISOString()
        : new Date(Date.now() - BACKFILL_MS).toISOString();

      const transcripts = await fetchRecentTranscripts(token, fromDate);

      let perUserInserted = 0;
      for (const t of transcripts) {
        const outcome = await processMeeting(admin, teamId, t);
        if (outcome.inserted) {
          meetingsInserted++;
          perUserInserted++;
        } else if (outcome.error) {
          errors.push(`${t.id}: ${outcome.error}`);
        }
      }

      await admin
        .from('user_integrations')
        .update({ last_sync_at: new Date().toISOString() })
        .eq('id', userIntegrationId);

      logIntegration({
        team_id: teamId,
        user_id: row.user_id as string,
        provider: 'fireflies',
        action: 'sync_user',
        outcome: 'ok',
        transcripts_fetched: transcripts.length,
        meetings_inserted: perUserInserted,
      });
    } catch (err) {
      usersFailed++;
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`user ${row.user_id}: ${message}`);
      // 401/403 on Fireflies → mark integration expired so status page shows it.
      if (/401|403|unauthori[sz]ed/i.test(message)) {
        await markIntegrationStatus(admin, userIntegrationId, 'expired', message.slice(0, 200));
      }
      logIntegration({
        team_id: teamId,
        user_id: row.user_id as string,
        provider: 'fireflies',
        action: 'sync_user',
        outcome: 'error',
        error_message: message,
      });
    }

    await updateJobProgress(admin, jobId, {
      usersTotal: total,
      usersProcessed: i + 1,
      usersFailed,
      meetingsInserted,
    });
  }

  return {
    reposTotal: total,
    reposSynced: total - usersFailed,
    reposSkipped304: 0,
    reposFailed: usersFailed,
    meetingsInserted,
    errors,
  };
}

export { runFirefliesSync };
