import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-ssr';
import { getSupabaseAdmin } from '@/lib/supabase-server';

/**
 * GET /api/teams/join?code=XXXX
 * Look up a team by its team_code. Public endpoint for showing team name before joining.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')?.trim().toUpperCase();

  if (!code) {
    return NextResponse.json({ error: 'Team code is required' }, { status: 400 });
  }

  try {
    const admin = getSupabaseAdmin();

    const { data: team, error } = await admin
      .from('teams')
      .select('id, name')
      .eq('team_code', code)
      .single();

    if (error || !team) {
      return NextResponse.json({ error: 'Team not found. Check the code and try again.' }, { status: 404 });
    }

    // Get member count for display
    const { count } = await admin
      .from('team_members')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', team.id);

    return NextResponse.json({
      team: {
        id: team.id,
        name: team.name,
        memberCount: count ?? 0,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to look up team' }, { status: 500 });
  }
}

/**
 * POST /api/teams/join
 * Join a team by its team_code. Requires authenticated user.
 * Body: { code: string }
 */
export async function POST(request: Request) {
  try {
    const supabase = await getSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { code } = await request.json();
    const normalizedCode = code?.trim().toUpperCase();

    if (!normalizedCode) {
      return NextResponse.json({ error: 'Team code is required' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    // Find team by code
    const { data: team, error: teamError } = await admin
      .from('teams')
      .select('id, name, slug')
      .eq('team_code', normalizedCode)
      .single();

    if (teamError || !team) {
      return NextResponse.json({ error: 'Team not found. Check the code and try again.' }, { status: 404 });
    }

    // Check if user is already a member
    const { data: existing } = await admin
      .from('team_members')
      .select('id')
      .eq('team_id', team.id)
      .eq('user_id', user.id)
      .single();

    if (existing) {
      return NextResponse.json({ error: 'You are already a member of this team' }, { status: 409 });
    }

    // Add user as developer
    const { data: member, error: memberError } = await admin
      .from('team_members')
      .insert({
        team_id: team.id,
        user_id: user.id,
        email: user.email,
        name: user.user_metadata?.name ?? user.email,
        role: 'developer',
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
