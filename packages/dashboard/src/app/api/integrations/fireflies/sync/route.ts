import { NextResponse, after } from 'next/server';
import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import {
  extractTasksFromTranscript,
  persistExtractedTasks,
} from '@/lib/services/task-extractor';
import { guardApi } from '@/lib/auth';
import { isMultiUserEnabled } from '@/lib/integrations/feature-flag';
import { getProvider } from '@/lib/integrations/registry';
import {
  createOrGetActiveJob,
  markJobDone,
  markJobFailed,
  markJobRunning,
} from '@/lib/integrations/sync-jobs';
import { logIntegration } from '@/lib/integrations/logger';

/**
 * POST /api/integrations/fireflies/sync
 * Body: { team_id: string }
 *
 * Branches on the per-team feature flag. See github/sync/route.ts for the
 * same pattern — Fireflies only differs in the underlying adapter.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { team_id: teamId } = body ?? {};
    if (!teamId) {
      return NextResponse.json({ error: 'team_id is required' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const multiUser = await isMultiUserEnabled(admin, teamId);

    if (multiUser) {
      const guard = await guardApi({ teamId });
      if (guard.response) return guard.response;
      const ctx = guard.ctx;

      const { job, reused } = await createOrGetActiveJob(admin, teamId, 'fireflies', ctx.userId);

      if (!reused) {
        after(async () => {
          try {
            await markJobRunning(admin, job.id);
            const adapter = getProvider('fireflies');
            const result = await adapter.sync({
              teamId,
              jobId: job.id,
              triggeredByUserId: ctx.userId,
            });
            await markJobDone(admin, job.id, result as unknown as Record<string, unknown>);
            logIntegration({
              team_id: teamId,
              provider: 'fireflies',
              action: 'sync_job_done',
              outcome: 'ok',
              job_id: job.id,
              ...(result as unknown as Record<string, unknown>),
            });
          } catch (err) {
            await markJobFailed(admin, job.id, err);
            logIntegration({
              team_id: teamId,
              provider: 'fireflies',
              action: 'sync_job_failed',
              outcome: 'error',
              job_id: job.id,
              error_message: err instanceof Error ? err.message : String(err),
            });
          }
        });
      }

      return NextResponse.json(
        { success: true, flow: 'v2', jobId: job.id, reused, status: job.status },
        { status: 202 }
      );
    }

    return await handleLegacySync(teamId);
  } catch (err) {
    console.error('Fireflies sync error:', err);
    return NextResponse.json({ error: 'Sync failed unexpectedly' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Legacy path — preserved verbatim from before the rework
// ---------------------------------------------------------------------------

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

interface SyncResult {
  meetingsFound: number;
  meetingsProcessed: number;
  meetingsSkipped: number;
  tasksExtracted: number;
  errors: string[];
}

async function fetchRecentTranscripts(
  apiKey: string,
  fromDate: string,
  limit: number = 50
): Promise<FirefliesTranscript[]> {
  const response = await fetch('https://api.fireflies.ai/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
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
  const data = await response.json();
  if (data.errors) {
    throw new Error(data.errors[0]?.message ?? 'Fireflies API error');
  }
  return data?.data?.transcripts ?? [];
}

async function processMeeting(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  teamId: string,
  transcript: FirefliesTranscript
): Promise<{ processed: boolean; tasksCount: number; error?: string }> {
  const { data: existing } = await supabase
    .from('meetings')
    .select('id')
    .eq('external_id', transcript.id)
    .eq('team_id', teamId)
    .single();
  if (existing) return { processed: false, tasksCount: 0 };

  const { data: teamMembers } = await supabase
    .from('team_members')
    .select('id, name, email')
    .eq('team_id', teamId);
  const members = teamMembers ?? [];

  const participants = (transcript.participants ?? []).map((name) => {
    const normalized = name.toLowerCase().trim();
    const matched = members.find((m) => {
      const memberName = m.name.toLowerCase();
      return (
        memberName === normalized ||
        memberName.includes(normalized) ||
        normalized.includes(memberName) ||
        memberName.split(' ')[0] === normalized.split(' ')[0]
      );
    });
    return { name, member_id: matched?.id ?? null };
  });

  const transcriptText = transcript.sentences
    ? transcript.sentences.map((s) => `${s.speaker_name}: ${s.text}`).join('\n')
    : '';
  const durationMinutes = transcript.duration ? Math.round(transcript.duration / 60) : null;

  const summaryParts: string[] = [];
  if (transcript.summary?.overview) summaryParts.push(transcript.summary.overview);
  if (transcript.summary?.shorthand_bullet?.length) {
    const bullets = transcript.summary.shorthand_bullet;
    if (typeof bullets === 'string') summaryParts.push('\n**Key Points:**\n' + bullets);
    else summaryParts.push('\n**Key Points:**\n' + bullets.map((b) => `• ${b}`).join('\n'));
  }
  const richSummary = summaryParts.length > 0 ? summaryParts.join('\n') : null;

  const meetingMetadata: Record<string, unknown> = {};
  if (transcript.summary?.keywords?.length) meetingMetadata.keywords = transcript.summary.keywords;
  if (transcript.summary?.action_items?.length) meetingMetadata.fireflies_action_items = transcript.summary.action_items;
  if (transcript.summary?.short_summary) meetingMetadata.short_summary = transcript.summary.short_summary;

  const { data: meeting, error: meetingError } = await supabase
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
      metadata: Object.keys(meetingMetadata).length > 0 ? meetingMetadata : null,
      created_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (meetingError || !meeting) {
    return { processed: false, tasksCount: 0, error: `Failed to insert meeting: ${meetingError?.message}` };
  }

  for (const participant of participants) {
    if (participant.member_id) {
      await supabase.from('activity_timeline').insert({
        team_id: teamId,
        developer_id: participant.member_id,
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
  }

  let tasksCount = 0;
  let extractedTasks: import('@/lib/services/task-extractor').ExtractedTask[] = [];
  if (transcriptText.length > 50) {
    extractedTasks = await extractTasksFromTranscript(transcriptText, members);
  }
  if (extractedTasks.length === 0 && transcript.summary?.action_items?.length) {
    const rawItems = transcript.summary.action_items;
    const itemList = typeof rawItems === 'string'
      ? rawItems.split('\n').map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith('**'))
      : rawItems;
    extractedTasks = itemList.map((item) => ({
      title: item.length > 200 ? item.slice(0, 200) : item,
      assignee: null,
      priority: 'medium' as const,
      deadline: null,
      description: null,
      project: null,
    }));
  }
  if (extractedTasks.length > 0) {
    tasksCount = await persistExtractedTasks(meeting.id, teamId, extractedTasks, members);
  }

  return { processed: true, tasksCount };
}

async function handleLegacySync(teamId: string): Promise<NextResponse> {
  const guard = await guardApi({ teamId, roles: ['owner', 'manager'] });
  if (guard.response) return guard.response;

  const supabase = getSupabaseAdmin();

  const { data: integration } = await supabase
    .from('integrations')
    .select('id, access_token, last_sync_at, config')
    .eq('team_id', teamId)
    .eq('provider', 'fireflies')
    .eq('status', 'active')
    .single();

  if (!integration) {
    return NextResponse.json(
      { error: 'Fireflies is not connected. Please add your API key first.' },
      { status: 404 }
    );
  }

  const config = integration.config as Record<string, unknown> | null;
  const connectedAt = config?.connected_at as string | undefined;
  const rawLastSync = integration.last_sync_at as string | null;

  let isFirstSync = !rawLastSync;
  if (rawLastSync && connectedAt) {
    const syncTime = new Date(rawLastSync).getTime();
    const connectTime = new Date(connectedAt).getTime();
    if (Math.abs(syncTime - connectTime) < 5000) isFirstSync = true;
  }
  if (!isFirstSync) {
    const { count } = await supabase
      .from('meetings')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .eq('source', 'fireflies');
    if (count === 0) isFirstSync = true;
  }

  const fromDate = isFirstSync
    ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    : new Date(rawLastSync!).toISOString();

  let transcripts: FirefliesTranscript[];
  try {
    transcripts = await fetchRecentTranscripts(integration.access_token, fromDate);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to fetch from Fireflies: ${message}` },
      { status: 502 }
    );
  }

  const result: SyncResult = {
    meetingsFound: transcripts.length,
    meetingsProcessed: 0,
    meetingsSkipped: 0,
    tasksExtracted: 0,
    errors: [],
  };

  for (const t of transcripts) {
    try {
      const outcome = await processMeeting(supabase, teamId, t);
      if (outcome.processed) {
        result.meetingsProcessed++;
        result.tasksExtracted += outcome.tasksCount;
      } else {
        result.meetingsSkipped++;
      }
      if (outcome.error) result.errors.push(`${t.id}: ${outcome.error}`);
    } catch (err) {
      result.errors.push(`${t.id}: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }

  await supabase
    .from('integrations')
    .update({ last_sync_at: new Date().toISOString() })
    .eq('id', integration.id);

  return NextResponse.json({ success: true, ...result, syncedAt: new Date().toISOString() });
}
