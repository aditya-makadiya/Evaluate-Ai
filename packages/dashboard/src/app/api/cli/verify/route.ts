import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabase-server';

/**
 * GET /api/cli/verify — Verify a CLI token is valid
 * Used by `evalai whoami` and `evalai login --token`
 */
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401 });
    }

    const tokenHash = createHash('sha256').update(token).digest('hex');
    const admin = getSupabaseAdmin();

    const { data: cliToken } = await admin
      .from('cli_tokens')
      .select('user_id, team_id, member_id, revoked_at')
      .eq('token_hash', tokenHash)
      .single();

    if (!cliToken || cliToken.revoked_at) {
      return NextResponse.json({ error: 'Invalid or revoked token' }, { status: 401 });
    }

    // Get user and team info
    const [{ data: member }, { data: team }] = await Promise.all([
      admin.from('team_members').select('name, email, role').eq('id', cliToken.member_id).single(),
      admin.from('teams').select('name').eq('id', cliToken.team_id).single(),
    ]);

    // Update last_used_at
    admin.from('cli_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('token_hash', tokenHash)
      .then(() => {});

    return NextResponse.json({
      valid: true,
      userId: cliToken.user_id,
      teamId: cliToken.team_id,
      memberId: cliToken.member_id,
      email: member?.email ?? '',
      name: member?.name ?? '',
      role: member?.role ?? '',
      teamName: team?.name ?? '',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
