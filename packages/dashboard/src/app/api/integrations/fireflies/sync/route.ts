import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import {
  extractTasksFromTranscript,
  persistExtractedTasks,
} from '@/lib/services/task-extractor';
import { guardApi } from '@/lib/auth';

// ---------- Types ----------

interface FirefliesTranscript {
  id: string;
  title: string;
  date: string;
  duration: number;
  organizer_email?: string;
  participants?: string[];
  sentences?: Array<{
    speaker_name: string;
    text: string;
    start_time: number;
    end_time: number;
  }>;
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

// ---------- Fireflies API ----------

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
            sentences {
              speaker_name
              text
              start_time
              end_time
            }
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
    console.error('Fireflies API errors:', data.errors);
    throw new Error(data.errors[0]?.message ?? 'Fireflies API error');
  }

  return data?.data?.transcripts ?? [];
}

// ---------- Meeting Processor ----------

async function processMeeting(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  teamId: string,
  transcript: FirefliesTranscript
): Promise<{ processed: boolean; tasksCount: number; error?: string }> {
  // Check for duplicate (idempotency)
  const { data: existing } = await supabase
    .from('meetings')
    .select('id')
    .eq('external_id', transcript.id)
    .eq('team_id', teamId)
    .single();

  if (existing) {
    return { processed: false, tasksCount: 0 };
  }

  // Get team members for participant mapping
  const { data: teamMembers } = await supabase
    .from('team_members')
    .select('id, name, email')
    .eq('team_id', teamId);

  const members = teamMembers ?? [];

  // Map participant names to team members
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

  // Build transcript text from sentences
  const transcriptText = transcript.sentences
    ? transcript.sentences.map((s) => `${s.speaker_name}: ${s.text}`).join('\n')
    : '';

  const durationMinutes = transcript.duration
    ? Math.round(transcript.duration / 60)
    : null;

  // Build rich summary from all available Fireflies summary fields
  const summaryParts: string[] = [];
  if (transcript.summary?.overview) {
    summaryParts.push(transcript.summary.overview);
  }
  if (transcript.summary?.shorthand_bullet?.length) {
    const bullets = transcript.summary.shorthand_bullet;
    if (typeof bullets === 'string') {
      summaryParts.push('\n**Key Points:**\n' + bullets);
    } else {
      summaryParts.push(
        '\n**Key Points:**\n' + bullets.map((b) => `• ${b}`).join('\n')
      );
    }
  }
  const richSummary = summaryParts.length > 0 ? summaryParts.join('\n') : null;

  // Store keywords and raw action items from Fireflies in metadata
  const meetingMetadata: Record<string, unknown> = {};
  if (transcript.summary?.keywords?.length) {
    meetingMetadata.keywords = transcript.summary.keywords;
  }
  if (transcript.summary?.action_items?.length) {
    meetingMetadata.fireflies_action_items = transcript.summary.action_items;
  }
  if (transcript.summary?.short_summary) {
    meetingMetadata.short_summary = transcript.summary.short_summary;
  }

  // Insert meeting
  const { data: meeting, error: meetingError } = await supabase
    .from('meetings')
    .insert({
      team_id: teamId,
      external_id: transcript.id,
      title: transcript.title ?? 'Untitled Meeting',
      date: transcript.date
        ? new Date(transcript.date).toISOString()
        : new Date().toISOString(),
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
    return {
      processed: false,
      tasksCount: 0,
      error: `Failed to insert meeting: ${meetingError?.message}`,
    };
  }

  // Insert timeline events for matched participants
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
        occurred_at: transcript.date
          ? new Date(transcript.date).toISOString()
          : new Date().toISOString(),
      });
    }
  }

  // Extract tasks from transcript using AI, with Fireflies fallback
  let tasksCount = 0;
  let extractedTasks: import('@/lib/services/task-extractor').ExtractedTask[] = [];

  if (transcriptText.length > 50) {
    extractedTasks = await extractTasksFromTranscript(transcriptText, members);
  }

  // Fallback: use Fireflies action_items if AI extraction returned nothing
  if (extractedTasks.length === 0 && transcript.summary?.action_items?.length) {
    const rawItems = transcript.summary.action_items;
    // Fireflies may return action_items as a single string — split into lines
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

// ---------- Main Handler ----------

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { team_id: teamId } = body;

    if (!teamId) {
      return NextResponse.json({ error: 'team_id is required' }, { status: 400 });
    }

    const guard = await guardApi({ teamId, roles: ['owner', 'manager'] });
    if (guard.response) return guard.response;

    const supabase = getSupabaseAdmin();

    // Get Fireflies integration for this team
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

    // Determine sync window: from last sync, or last 30 days for first sync
    // If last_sync_at is within 5 seconds of connected_at, no real sync happened yet (legacy bug fix)
    const config = integration.config as Record<string, unknown> | null;
    const connectedAt = config?.connected_at as string | undefined;
    const rawLastSync = integration.last_sync_at as string | null;

    let isFirstSync = !rawLastSync;
    if (rawLastSync && connectedAt) {
      const syncTime = new Date(rawLastSync).getTime();
      const connectTime = new Date(connectedAt).getTime();
      if (Math.abs(syncTime - connectTime) < 5000) {
        isFirstSync = true;
      }
    }

    // Also check: if no meetings exist for this team, treat as first sync
    if (!isFirstSync) {
      const { count } = await supabase
        .from('meetings')
        .select('id', { count: 'exact', head: true })
        .eq('team_id', teamId)
        .eq('source', 'fireflies');
      if (count === 0) {
        isFirstSync = true;
      }
    }

    const fromDate = isFirstSync
      ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      : new Date(rawLastSync!).toISOString();

    console.log(`[Fireflies Sync] team=${teamId}, fromDate=${fromDate}, lastSyncAt=${rawLastSync ?? 'never'}, isFirstSync=${isFirstSync}`);

    // Fetch transcripts from Fireflies
    let transcripts: FirefliesTranscript[];
    try {
      transcripts = await fetchRecentTranscripts(integration.access_token, fromDate);
      console.log(`[Fireflies Sync] Fetched ${transcripts.length} transcripts from Fireflies`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return NextResponse.json(
        { error: `Failed to fetch from Fireflies: ${message}` },
        { status: 502 }
      );
    }

    // Process each transcript
    const result: SyncResult = {
      meetingsFound: transcripts.length,
      meetingsProcessed: 0,
      meetingsSkipped: 0,
      tasksExtracted: 0,
      errors: [],
    };

    for (const transcript of transcripts) {
      const { processed, tasksCount, error } = await processMeeting(
        supabase,
        teamId,
        transcript
      );

      if (error) {
        result.errors.push(error);
      } else if (processed) {
        result.meetingsProcessed++;
        result.tasksExtracted += tasksCount;
      } else {
        result.meetingsSkipped++;
      }
    }

    // Update last_sync_at
    await supabase
      .from('integrations')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', integration.id);

    return NextResponse.json({
      success: true,
      ...result,
      syncedAt: new Date().toISOString(),
      syncWindow: { from: fromDate, lastSyncAt: rawLastSync ?? null, isFirstSync },
    });
  } catch (err) {
    console.error('Fireflies sync error:', err);
    return NextResponse.json(
      { error: 'Sync failed unexpectedly' },
      { status: 500 }
    );
  }
}
