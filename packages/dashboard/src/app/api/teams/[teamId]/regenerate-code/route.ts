import { NextResponse } from 'next/server';
import { getAuthContext, requireRole } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase-server';

function generateTeamCode(name: string): string {
  const prefix = name
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 4)
    || 'TEAM';
  const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${suffix}`;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;
    const ctx = await getAuthContext(teamId);

    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!requireRole(ctx, 'owner', 'manager')) {
      return NextResponse.json({ error: 'Only owners and managers can regenerate the team code' }, { status: 403 });
    }

    const admin = getSupabaseAdmin();
    const newCode = generateTeamCode(ctx.teamName);

    const { data: team, error } = await admin
      .from('teams')
      .update({ team_code: newCode })
      .eq('id', teamId)
      .select('team_code')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ teamCode: team.team_code });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
