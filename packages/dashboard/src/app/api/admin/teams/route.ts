import { NextResponse } from 'next/server';
import { getAdminAuthContext } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-server';

export async function GET() {
  const ctx = await getAdminAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const admin = getSupabaseAdmin();

    const { data: teams } = await admin
      .from('teams')
      .select('id, name, slug, team_code, created_at, owner_id')
      .order('created_at', { ascending: false });

    if (!teams || teams.length === 0) {
      return NextResponse.json({ teams: [] });
    }

    const teamIds = teams.map((t) => t.id);

    // Fetch all related data in parallel. Integrations is two queries —
    // legacy `integrations` (team-scoped) and `user_integrations` (per-user).
    // Per team we count distinct active providers across both tables so a
    // team that has GitHub on v2 *and* Fireflies on legacy reports 2, not 3.
    const [membersRes, legacyIntegrationsRes, v2IntegrationsRes, sessionsRes] = await Promise.all([
      admin
        .from('team_members')
        .select('team_id, is_active')
        .in('team_id', teamIds),
      admin
        .from('integrations')
        .select('team_id, provider, status')
        .in('team_id', teamIds),
      admin
        .from('user_integrations')
        .select('team_id, provider, status')
        .in('team_id', teamIds),
      admin
        .from('ai_sessions')
        .select('team_id, total_cost_usd, started_at')
        .in('team_id', teamIds),
    ]);

    // Aggregate per team
    const membersByTeam = new Map<string, { total: number; active: number }>();
    for (const m of membersRes.data ?? []) {
      const entry = membersByTeam.get(m.team_id) ?? { total: 0, active: 0 };
      entry.total += 1;
      if (m.is_active) entry.active += 1;
      membersByTeam.set(m.team_id, entry);
    }

    const providersByTeam = new Map<string, Set<string>>();
    for (const i of legacyIntegrationsRes.data ?? []) {
      if (i.status !== 'active') continue;
      const set = providersByTeam.get(i.team_id) ?? new Set<string>();
      set.add(i.provider);
      providersByTeam.set(i.team_id, set);
    }
    for (const i of v2IntegrationsRes.data ?? []) {
      if (i.status !== 'active') continue;
      const set = providersByTeam.get(i.team_id) ?? new Set<string>();
      set.add(i.provider);
      providersByTeam.set(i.team_id, set);
    }
    const integrationsByTeam = new Map<string, number>();
    for (const [tid, set] of providersByTeam) {
      integrationsByTeam.set(tid, set.size);
    }

    const costByTeam = new Map<string, { cost: number; sessions: number; lastActive: string }>();
    for (const s of sessionsRes.data ?? []) {
      const entry = costByTeam.get(s.team_id) ?? { cost: 0, sessions: 0, lastActive: '' };
      entry.cost += s.total_cost_usd ?? 0;
      entry.sessions += 1;
      if (s.started_at > entry.lastActive) entry.lastActive = s.started_at;
      costByTeam.set(s.team_id, entry);
    }

    const enrichedTeams = teams.map((team) => {
      const members = membersByTeam.get(team.id) ?? { total: 0, active: 0 };
      const integrations = integrationsByTeam.get(team.id) ?? 0;
      const sessionData = costByTeam.get(team.id) ?? { cost: 0, sessions: 0, lastActive: '' };

      return {
        id: team.id,
        name: team.name,
        slug: team.slug,
        createdAt: team.created_at,
        memberCount: members.total,
        activeMembers: members.active,
        integrations,
        totalCost: sessionData.cost,
        totalSessions: sessionData.sessions,
        lastActive: sessionData.lastActive || team.created_at,
      };
    });

    return NextResponse.json({ teams: enrichedTeams });
  } catch (error) {
    console.error('Admin teams error:', error);
    return NextResponse.json({ teams: [] });
  }
}
