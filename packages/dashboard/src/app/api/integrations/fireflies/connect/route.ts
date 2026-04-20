import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import { guardApi } from '@/lib/auth';

/**
 * POST /api/integrations/fireflies/connect
 * Saves the Fireflies API key and verifies it by calling their GraphQL API.
 *
 * Body: { team_id: string, api_key: string }
 * RBAC: owner and manager only.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { team_id: teamId, api_key: apiKey } = body;

    if (!teamId || !apiKey) {
      return NextResponse.json(
        { error: 'team_id and api_key are required' },
        { status: 400 }
      );
    }

    const guard = await guardApi({ teamId, roles: ['owner', 'manager'] });
    if (guard.response) return guard.response;

    // Verify the API key by calling Fireflies GraphQL API
    // Note: Fireflies user query supports: name, user_id, integrations (not email)
    const verifyResponse = await fetch('https://api.fireflies.ai/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: `query { user { name user_id } }`,
      }),
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

    console.log('Fireflies verify response:', verifyResponse.status, JSON.stringify(verifyData));

    if (!verifyResponse.ok || verifyData.errors) {
      const errMsg = verifyData.errors
        ? (verifyData.errors as Array<{ message?: string }>)[0]?.message ?? 'Unknown error'
        : `HTTP ${verifyResponse.status}`;
      return NextResponse.json(
        { error: `Fireflies API: ${errMsg}` },
        { status: 401 }
      );
    }

    const userInfo = (verifyData?.data as Record<string, unknown>)?.user as Record<string, unknown> ?? {};

    // Store integration in Supabase
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
      // Do NOT set last_sync_at here — leave it null so the first sync
      // uses the 30-day fallback window and fetches existing meetings
      last_sync_at: null,
    };

    // Upsert: update if already exists
    const { error: upsertError } = await supabase
      .from('integrations')
      .upsert(integrationData, { onConflict: 'team_id,provider' });

    if (upsertError) {
      // Fallback: manual insert/update
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
  } catch (err) {
    console.error('Fireflies connect error:', err);
    return NextResponse.json(
      { error: 'Failed to connect Fireflies' },
      { status: 500 }
    );
  }
}
