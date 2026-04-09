import { NextResponse } from 'next/server';
import { getAuthContext, requireRole } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase-server';

export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!requireRole(ctx, 'owner', 'manager')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const teamId = ctx.teamId;
    const supabase = getSupabaseAdmin();

    // Fetch all config entries
    const { data: configData } = await supabase
      .from('config')
      .select('key, value, updated_at')
      .eq('team_id', teamId);

    // Fetch team members (no sensitive data)
    const { data: members } = await supabase
      .from('team_members')
      .select('id, name, email, role, github_username, evaluateai_installed')
      .eq('team_id', teamId);

    // Fetch team info
    const { data: team } = await supabase
      .from('teams')
      .select('id, name, team_code, created_at')
      .eq('id', teamId)
      .single();

    const exportData = {
      exportedAt: new Date().toISOString(),
      exportedBy: ctx.email,
      team: team ? {
        name: team.name,
        teamCode: team.team_code,
        createdAt: team.created_at,
      } : null,
      config: (configData ?? []).reduce(
        (acc, row) => {
          acc[row.key] = { value: row.value, updatedAt: row.updated_at };
          return acc;
        },
        {} as Record<string, { value: string; updatedAt: string }>,
      ),
      members: (members ?? []).map(m => ({
        name: m.name,
        email: m.email,
        role: m.role,
        githubUsername: m.github_username,
        evaluateaiInstalled: m.evaluateai_installed,
      })),
    };

    const json = JSON.stringify(exportData, null, 2);

    return new NextResponse(json, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="evaluateai-export-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (err) {
    console.error('Config export error:', err);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}
