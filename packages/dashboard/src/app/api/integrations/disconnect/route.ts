import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import { guardApi } from '@/lib/auth';
import { isMultiUserEnabled } from '@/lib/integrations/feature-flag';
import { isProviderSlug, getProvider } from '@/lib/integrations/registry';
import { decryptAccessToken } from '@/lib/integrations/user-integrations';
import { logIntegration } from '@/lib/integrations/logger';

/**
 * POST /api/integrations/disconnect
 *
 * Body: {
 *   team_id: string,
 *   provider: 'github' | 'fireflies',
 *   target_user_id?: string   // v2-only; omit to disconnect self
 * }
 *
 * Authorization:
 *   - Legacy flow (flag off): owner/manager only
 *   - Per-user flow (flag on):
 *       - Self-disconnect (target_user_id omitted or equals ctx.userId):
 *         any team member
 *       - Disconnect another user: owner/manager only
 *
 * Side effects:
 *   - v2: delete user_integrations row, call adapter.revoke at provider.
 *         user_integration_repos cascades via FK.
 *   - legacy: mark integrations row status='revoked' and clear tokens.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { team_id: teamId, provider, target_user_id: targetUserId } = body ?? {};

    if (!teamId || !provider) {
      return NextResponse.json(
        { error: 'team_id and provider are required' },
        { status: 400 }
      );
    }
    if (!isProviderSlug(provider)) {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const multiUser = await isMultiUserEnabled(admin, teamId);

    if (!multiUser) {
      // Legacy path — unchanged
      return handleLegacyDisconnect(teamId, provider);
    }

    // Authenticate first so we know who the caller is — the role check
    // below depends on whether target equals self.
    const guard = await guardApi({ teamId });
    if (guard.response) return guard.response;
    const ctx = guard.ctx;

    const effectiveTargetUserId = targetUserId ?? ctx.userId;
    const disconnectingSelf = effectiveTargetUserId === ctx.userId;

    // Disconnecting someone else requires manager/owner. A developer
    // passing their own user_id explicitly is still self-disconnect.
    if (!disconnectingSelf && !['owner', 'manager'].includes(ctx.role)) {
      return NextResponse.json(
        { error: 'Forbidden: only owners or managers can disconnect another user' },
        { status: 403 }
      );
    }

    const { data: row, error: fetchErr } = await admin
      .from('user_integrations')
      .select('id, access_token_encrypted, external_account_handle')
      .eq('team_id', teamId)
      .eq('user_id', effectiveTargetUserId)
      .eq('provider', provider)
      .single();

    if (fetchErr || !row) {
      return NextResponse.json(
        { error: `${provider} is not connected for that user` },
        { status: 404 }
      );
    }

    // Best-effort revoke at the provider — a failure here does not block
    // local state cleanup. The user's token might already be revoked
    // (404), or the provider might be temporarily unreachable; either way
    // we stop trusting the credential locally.
    const adapter = getProvider(provider);
    if (adapter.revoke) {
      try {
        const plaintext = decryptAccessToken(row);
        await adapter.revoke(plaintext);
      } catch (err) {
        logIntegration({
          team_id: teamId,
          user_id: effectiveTargetUserId,
          provider,
          action: 'provider_revoke',
          outcome: 'error',
          error_message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const { error: delErr } = await admin
      .from('user_integrations')
      .delete()
      .eq('id', row.id);

    if (delErr) {
      return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 });
    }

    logIntegration({
      team_id: teamId,
      user_id: effectiveTargetUserId,
      provider,
      action: 'disconnect',
      outcome: 'ok',
      initiated_by: ctx.userId,
      self: disconnectingSelf,
    });

    return NextResponse.json({ success: true, provider, user_id: effectiveTargetUserId });
  } catch (err) {
    console.error('Disconnect error:', err);
    return NextResponse.json(
      { error: 'Failed to disconnect integration' },
      { status: 500 }
    );
  }
}

async function handleLegacyDisconnect(
  teamId: string,
  provider: string
): Promise<NextResponse> {
  const guard = await guardApi({ teamId, roles: ['owner', 'manager'] });
  if (guard.response) return guard.response;

  const supabase = getSupabaseAdmin();

  const { data: integration } = await supabase
    .from('integrations')
    .select('id')
    .eq('team_id', teamId)
    .eq('provider', provider)
    .eq('status', 'active')
    .single();

  if (!integration) {
    return NextResponse.json(
      { error: `${provider} is not connected` },
      { status: 404 }
    );
  }

  await supabase
    .from('integrations')
    .update({
      status: 'revoked',
      access_token: '',
      refresh_token: '',
      config: { disconnected_at: new Date().toISOString() },
    })
    .eq('id', integration.id);

  return NextResponse.json({ success: true, provider });
}
