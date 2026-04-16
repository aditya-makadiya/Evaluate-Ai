import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuthContext } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-server';

function getPeriodStart(period: string): string {
  const now = new Date();
  switch (period) {
    case 'week': {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return d.toISOString();
    }
    case 'quarter': {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 3);
      return d.toISOString();
    }
    case 'month':
    default: {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 1);
      return d.toISOString();
    }
  }
}

export async function GET(request: NextRequest) {
  const ctx = await getAdminAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') ?? 'month';
    const teamId = searchParams.get('teamId') ?? '';
    const since = getPeriodStart(period);

    const admin = getSupabaseAdmin();

    let changesQuery = admin
      .from('code_changes')
      .select('id, type, repo, developer_id, additions, deletions, files_changed, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: true });

    if (teamId) {
      changesQuery = changesQuery.eq('team_id', teamId);
    }

    const { data: changes } = await changesQuery;

    const allChanges = changes ?? [];

    // Aggregate by type
    const commits = allChanges.filter((c) => c.type === 'commit').length;
    const prsOpened = allChanges.filter((c) => c.type === 'pr_opened').length;
    const prsMerged = allChanges.filter((c) => c.type === 'pr_merged').length;

    // Top repos by activity
    const repoMap = new Map<string, number>();
    for (const c of allChanges) {
      if (c.repo) {
        repoMap.set(c.repo, (repoMap.get(c.repo) ?? 0) + 1);
      }
    }
    const topRepos = Array.from(repoMap.entries())
      .map(([repo, count]) => ({ repo, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Per-developer counts
    const devMap = new Map<string, { commits: number; prs: number }>();
    for (const c of allChanges) {
      if (!c.developer_id) continue;
      const entry = devMap.get(c.developer_id) ?? { commits: 0, prs: 0 };
      if (c.type === 'commit') entry.commits += 1;
      else entry.prs += 1;
      devMap.set(c.developer_id, entry);
    }

    // Resolve developer names
    const devIds = Array.from(devMap.keys());
    const devNames = new Map<string, string>();
    if (devIds.length > 0) {
      const { data: members } = await admin
        .from('team_members')
        .select('id, name, email')
        .in('id', devIds);
      for (const m of members ?? []) {
        devNames.set(m.id, m.name || m.email || m.id);
      }
    }

    const developerActivity = Array.from(devMap.entries())
      .map(([id, stats]) => ({
        developerId: id,
        name: devNames.get(id) ?? id,
        ...stats,
        total: stats.commits + stats.prs,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 15);

    // Daily trend
    const dailyMap = new Map<string, { commits: number; prs: number }>();
    for (const c of allChanges) {
      const day = c.created_at.slice(0, 10);
      const entry = dailyMap.get(day) ?? { commits: 0, prs: 0 };
      if (c.type === 'commit') entry.commits += 1;
      else entry.prs += 1;
      dailyMap.set(day, entry);
    }
    const dailyTrend = Array.from(dailyMap.entries())
      .map(([date, stats]) => ({ date, ...stats }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      commits,
      prsOpened,
      prsMerged,
      topRepos,
      developerActivity,
      dailyTrend,
    });
  } catch (error) {
    console.error('Admin github error:', error);
    return NextResponse.json({
      commits: 0,
      prsOpened: 0,
      prsMerged: 0,
      topRepos: [],
      developerActivity: [],
      dailyTrend: [],
    });
  }
}
