import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import { guardApi } from '@/lib/auth';
import { isMultiUserEnabled } from '@/lib/integrations/feature-flag';
import { getProvider } from '@/lib/integrations/registry';
import { upsertUserIntegration } from '@/lib/integrations/user-integrations';
import { logIntegration } from '@/lib/integrations/logger';

/**
 * POST /api/integrations/fireflies/connect
 * Body: { team_id: string, api_key: string }
 *
 * Two flows branch on teams.settings.multi_user_integrations_enabled:
 *   - Legacy (flag off): owner/manager only; row in `integrations`
 *   - Per-user (flag on): any team member; row in `user_integrations`
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { team_id: teamId, api_key: apiKey } = body ?? {};

    if (!teamId || !apiKey) {
      return NextResponse.json(
        { error: 'team_id and api_key are required' },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdmin();
    const multiUser = await isMultiUserEnabled(admin, teamId);

    const guard = await guardApi(
      multiUser ? { teamId } : { teamId, roles: ['owner', 'manager'] }
    );
    if (guard.response) return guard.response;
    const ctx = guard.ctx;

    if (multiUser) {
      return await handleV2Connect(teamId, ctx.userId, apiKey);
    }
    return await handleLegacyConnect(teamId, apiKey);
  } catch (err) {
    console.error('Fireflies connect error:', err);
    return NextResponse.json(
      { error: 'Failed to connect Fireflies' },
      { status: 500 }
    );
  }
}

async function handleV2Connect(
  teamId: string,
  userId: string,
  apiKey: string
): Promise<NextResponse> {
  const adapter = getProvider('fireflies');

  let validated;
  try {
    validated = await adapter.validateApiKey!(apiKey);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid API key';
    logIntegration({
      team_id: teamId,
      user_id: userId,
      provider: 'fireflies',
      action: 'validate_api_key',
      outcome: 'error',
      error_message: message,
    });
    return NextResponse.json({ error: message }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  await upsertUserIntegration(admin, {
    teamId,
    userId,
    provider: 'fireflies',
    tokens: validated.token,
    externalAccountId: validated.identity.id,
    externalAccountHandle: validated.identity.handle,
    config: { connected_at: new Date().toISOString() },
  });

  return NextResponse.json({
    success: true,
    flow: 'v2',
    accountName: validated.identity.handle,
    userId: validated.identity.id,
  });
}

async function handleLegacyConnect(
  teamId: string,
  apiKey: string
): Promise<NextResponse> {
  // Verify the API key by calling Fireflies GraphQL API
  const verifyResponse = await fetch('https://api.fireflies.ai/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query: `query { user { name user_id } }` }),
  });

  const responseText = await verifyResponse.text();
  let verifyData: Record<string, unknown>;
  try {
    verifyData = JSON.parse(responseText);
  } catch {
    console.error('Fireflies API returned non-JSON:', verifyResponse.status, responseText.slice(0, 500));
    return NextResponse.json(
      { error: `Fireflies API error (HTTP ${verifyResponse.status}). Check your API key.` },
      { status: 401 }
    );
  }

  if (!verifyResponse.ok || verifyData.errors) {
    const errMsg = verifyData.errors
      ? (verifyData.errors as Array<{ message?: string }>)[0]?.message ?? 'Unknown error'
      : `HTTP ${verifyResponse.status}`;
    return NextResponse.json({ error: `Fireflies API: ${errMsg}` }, { status: 401 });
  }

  const userInfo = ((verifyData?.data as Record<string, unknown>)?.user as Record<string, unknown>) ?? {};

  const supabase = getSupabaseAdmin();
  const integrationData = {
    team_id: teamId,
    provider: 'fireflies',
    access_token: apiKey,
    config: {
      connected_at: new Date().toISOString(),
      user_id: userInfo.user_id ?? null,
      account_name: userInfo.name ?? null,
    },
    status: 'active',
    last_sync_at: null,
  };

  const { error: upsertError } = await supabase
    .from('integrations')
    .upsert(integrationData, { onConflict: 'team_id,provider' });

  if (upsertError) {
    const { data: existing } = await supabase
      .from('integrations')
      .select('id')
      .eq('team_id', teamId)
      .eq('provider', 'fireflies')
      .single();

    if (existing) {
      await supabase
        .from('integrations')
        .update({
          access_token: apiKey,
          config: integrationData.config,
          status: 'active',
          last_sync_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    } else {
      await supabase.from('integrations').insert(integrationData);
    }
  }

  return NextResponse.json({
    success: true,
    accountName: (userInfo.name as string) ?? null,
    userId: (userInfo.user_id as string) ?? null,
  });
}
