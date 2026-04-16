import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuthContext } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  const ctx = await getAdminAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') ?? '';
    const filterTeam = searchParams.get('teamId') ?? searchParams.get('team') ?? '';
    const filterRole = searchParams.get('role') ?? '';

    const admin = getSupabaseAdmin();

    let membersQuery = admin
      .from('team_members')
      .select('id, team_id, user_id, name, email, role, github_username, evaluateai_installed, is_active, joined_at')
      .order('joined_at', { ascending: false });

    if (filterTeam) {
      membersQuery = membersQuery.eq('team_id', filterTeam);
    }
    if (filterRole) {
      membersQuery = membersQuery.eq('role', filterRole);
    }

    const { data: members } = await membersQuery;
    const allMembers = members ?? [];

    // Filter by search
    const filtered = search
      ? allMembers.filter(
          (m) =>
            (m.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
            (m.email ?? '').toLowerCase().includes(search.toLowerCase())
        )
      : allMembers;

    // Resolve team names
    const teamIds = [...new Set(filtered.map((m) => m.team_id))];
    const teamNames = new Map<string, string>();
    if (teamIds.length > 0) {
      const { data: teams } = await admin
        .from('teams')
        .select('id, name')
        .in('id', teamIds);
      for (const t of teams ?? []) {
        teamNames.set(t.id, t.name);
      }
    }

    // Get AI cost per developer
    const devIds = filtered.map((m) => m.id);
    const devCosts = new Map<string, { cost: number; sessions: number }>();
    if (devIds.length > 0) {
      const { data: sessions } = await admin
        .from('ai_sessions')
        .select('developer_id, total_cost_usd')
        .in('developer_id', devIds);
      for (const s of sessions ?? []) {
        if (!s.developer_id) continue;
        const entry = devCosts.get(s.developer_id) ?? { cost: 0, sessions: 0 };
        entry.cost += s.total_cost_usd ?? 0;
        entry.sessions += 1;
        devCosts.set(s.developer_id, entry);
      }
    }

    const users = filtered.map((m) => {
      const costData = devCosts.get(m.id) ?? { cost: 0, sessions: 0 };
      return {
        id: m.id,
        userId: m.user_id,
        name: m.name ?? '',
        email: m.email ?? '',
        role: m.role,
        teamId: m.team_id,
        teamName: teamNames.get(m.team_id) ?? m.team_id,
        githubUsername: m.github_username,
        cliInstalled: m.evaluateai_installed ?? false,
        isActive: m.is_active ?? true,
        joinedAt: m.joined_at,
        totalCost: costData.cost,
        totalSessions: costData.sessions,
      };
    });

    // Get list of all teams for filter dropdown
    const { data: allTeams } = await admin
      .from('teams')
      .select('id, name')
      .order('name', { ascending: true });

    return NextResponse.json({
      users,
      total: users.length,
      teams: (allTeams ?? []).map((t) => ({ id: t.id, name: t.name })),
    });
  } catch (error) {
    console.error('Admin users error:', error);
    return NextResponse.json({ users: [], total: 0, teams: [] });
  }
}
