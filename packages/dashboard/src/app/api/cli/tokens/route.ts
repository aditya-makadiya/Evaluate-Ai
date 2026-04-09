import { NextResponse } from 'next/server';
import { randomBytes, createHash } from 'node:crypto';
import { getAuthContext } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase-server';

/**
 * POST /api/cli/tokens — Generate a new CLI token
 * Called from the dashboard CLI auth page.
 */
export async function POST() {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Generate token: eai_ + 48 random chars
    const token = 'eai_' + randomBytes(36).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const tokenPrefix = token.slice(0, 12);

    const admin = getSupabaseAdmin();

    const { error } = await admin.from('cli_tokens').insert({
      user_id: ctx.userId,
      team_id: ctx.teamId,
      member_id: ctx.memberId,
      token_hash: tokenHash,
      token_prefix: tokenPrefix,
      name: 'CLI',
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Return plaintext token — only time it's ever shown
    return NextResponse.json({
      token,
      userId: ctx.userId,
      email: ctx.email,
      teamId: ctx.teamId,
      teamName: ctx.teamName,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/cli/tokens — List user's CLI tokens (prefix only)
 */
export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = getSupabaseAdmin();

    const { data: tokens, error } = await admin
      .from('cli_tokens')
      .select('id, token_prefix, name, last_used_at, created_at, revoked_at')
      .eq('user_id', ctx.userId)
      .eq('team_id', ctx.teamId)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      tokens: (tokens ?? []).map(t => ({
        id: t.id,
        prefix: t.token_prefix,
        name: t.name,
        lastUsedAt: t.last_used_at,
        createdAt: t.created_at,
        isRevoked: !!t.revoked_at,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/cli/tokens — Revoke a CLI token
 * Body: { tokenId: string }
 */
export async function DELETE(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { tokenId } = await request.json();
    if (!tokenId) {
      return NextResponse.json({ error: 'tokenId is required' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    const { error } = await admin
      .from('cli_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', tokenId)
      .eq('user_id', ctx.userId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
