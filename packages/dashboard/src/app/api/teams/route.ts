import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-ssr';
import { getSupabaseAdmin } from '@/lib/supabase-server';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function generateTeamCode(name: string): string {
  const prefix = name
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 4)
    || 'TEAM';
  const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${suffix}`;
}

export async function GET() {
  try {
    const supabase = await getSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = getSupabaseAdmin();

    // Get teams the user belongs to
    const { data: memberships, error: memberError } = await admin
      .from('team_members')
      .select('team_id, role')
      .eq('user_id', user.id);

    if (memberError) {
      return NextResponse.json({ error: memberError.message }, { status: 500 });
    }

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ teams: [] });
    }

    const teamIds = memberships.map((m) => m.team_id);

    // Get team details
    const { data: teams, error: teamsError } = await admin
      .from('teams')
      .select('*')
      .in('id', teamIds);

    if (teamsError) {
      return NextResponse.json({ error: teamsError.message }, { status: 500 });
    }

    // Get member counts for each team
    const teamsWithCounts = await Promise.all(
      (teams ?? []).map(async (team) => {
        const { count } = await admin
          .from('team_members')
          .select('*', { count: 'exact', head: true })
          .eq('team_id', team.id);

        const membership = memberships.find((m) => m.team_id === team.id);

        return {
          id: team.id,
          name: team.name,
          slug: team.slug,
          teamCode: team.team_code,
          createdAt: team.created_at,
          memberCount: count ?? 0,
          currentUserRole: membership?.role ?? null,
        };
      })
    );

    return NextResponse.json({ teams: teamsWithCounts });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await getSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name } = await request.json();

    if (!name) {
      return NextResponse.json(
        { error: 'Missing required field: name' },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdmin();
    const slug = slugify(name);
    const teamCode = generateTeamCode(name);

    // Create team with team_code
    const { data: team, error: teamError } = await admin
      .from('teams')
      .insert({ name, slug, team_code: teamCode })
      .select()
      .single();

    if (teamError) {
      return NextResponse.json({ error: teamError.message }, { status: 500 });
    }

    // Set current user as owner
    const { data: member, error: memberError } = await admin
      .from('team_members')
      .insert({
        team_id: team.id,
        user_id: user.id,
        email: user.email,
        name: user.user_metadata?.name ?? user.email,
        role: 'owner',
      })
      .select()
      .single();

    if (memberError) {
      return NextResponse.json({ error: memberError.message }, { status: 500 });
    }

    return NextResponse.json({
      team: {
        id: team.id,
        name: team.name,
        slug: team.slug,
        teamCode: team.team_code,
        createdAt: team.created_at,
      },
      member: {
        id: member.id,
        role: member.role,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
