import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase-server';

interface RouteContext {
  params: Promise<{ teamId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { teamId } = await context.params;
    const ctx = await getAuthContext(teamId);
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabaseAdmin();

    const { data: members, error } = await supabase
      .from('team_members')
      .select('*')
      .eq('team_id', teamId)
      .order('joined_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const formatted = (members ?? []).map((m) => ({
      id: m.id,
      userId: m.user_id,
      teamId: m.team_id,
      email: m.email,
      name: m.name,
      role: m.role,
      githubUsername: m.github_username ?? null,
      evaluateaiInstalled: m.evaluateai_installed ?? false,
      createdAt: m.joined_at,
    }));

    return NextResponse.json({ members: formatted });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { teamId } = await context.params;
    const ctx = await getAuthContext(teamId);
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { email, name, role, githubUsername } = await request.json();

    if (!email || !role) {
      return NextResponse.json(
        { error: 'Missing required fields: email, role' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Check if member already exists in this team
    const { data: existing } = await supabase
      .from('team_members')
      .select('id')
      .eq('team_id', teamId)
      .eq('email', email)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: 'Member with this email already exists in the team' },
        { status: 409 }
      );
    }

    const insertData: Record<string, unknown> = {
      team_id: teamId,
      email,
      role,
    };
    if (name) insertData.name = name;
    if (githubUsername) insertData.github_username = githubUsername;

    const { data: member, error } = await supabase
      .from('team_members')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      member: {
        id: member.id,
        userId: member.user_id,
        teamId: member.team_id,
        email: member.email,
        name: member.name,
        role: member.role,
        githubUsername: member.github_username ?? null,
        evaluateaiInstalled: member.evaluateai_installed ?? false,
        createdAt: member.created_at,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
