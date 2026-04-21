import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import { guardApi } from '@/lib/auth';
import { isMultiUserEnabled } from '@/lib/integrations/feature-flag';
import type { ProviderSlug } from '@/lib/integrations/types';

/**
 * GET /api/integrations/status?team_id=xxx
 *
 * Returns the team roster — who has connected what, when they last synced,
 * their OAuth handle, and rollup counts. Any team member can read this;
 * the service never leaks token material.
 *
 * Two shapes based on the per-team feature flag:
 *
 *   Legacy (flag off):  { flow: 'legacy', providers: { github: {...}, fireflies: {...} } }
 *   Per-user (flag on): { flow: 'v2',     providers: { github: { members: [...] }, ... } }
 *
 * Frontends can detect `flow` and render accordingly. During Phase 5 the
 * legacy shape is retired.
 */
export async function GET(request: NextRequest) {
  try {
    const teamId = request.nextUrl.searchParams.get('team_id');
    if (!teamId) {
      return NextResponse.json({ error: 'team_id is required' }, { status: 400 });
    }

    const guard = await guardApi({ teamId });
    if (guard.response) return guard.response;

    const admin = getSupabaseAdmin();
    const multiUser = await isMultiUserEnabled(admin, teamId);

    if (multiUser) {
      return NextResponse.json(await buildV2Status(admin, teamId));
    }
    return NextResponse.json(await buildLegacyStatus(admin, teamId));
  } catch (err) {
    console.error('Integration status error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch integration status' },
      { status: 500 }
    );
  }
}

interface V2MemberStatus {
  userId: string;
  name: string | null;
  email: string | null;
  role: string | null;
  externalAccountHandle: string | null;
  status: string;
  lastSyncAt: string | null;
  tokenExpiresAt: string | null;
  accessibleRepoCount: number;
}

interface V2ProviderSummary {
  provider: ProviderSlug;
  connectedCount: number;
  totalMemberCount: number;
  members: V2MemberStatus[];
}

async function buildV2Status(
  admin: ReturnType<typeof getSupabaseAdmin>,
  teamId: string
): Promise<{ flow: 'v2'; providers: Record<ProviderSlug, V2ProviderSummary> }> {
  const [membersRes, integrationsRes, repoCountsRes] = await Promise.all([
    admin
      .from('team_members')
      .select('id, user_id, name, email, role, is_active')
      .eq('team_id', teamId)
      .eq('is_active', true),
    admin
      .from('user_integrations_public')
      .select(
        'id, user_id, provider, external_account_handle, status, last_sync_at, token_expires_at'
      )
      .eq('team_id', teamId),
    admin
      .from('user_integration_repos')
      .select('user_integration_id, user_integrations!inner(team_id)')
      .eq('user_integrations.team_id', teamId),
  ]);

  if (membersRes.error) throw new Error(`members: ${membersRes.error.message}`);
  if (integrationsRes.error) throw new Error(`integrations: ${integrationsRes.error.message}`);
  if (repoCountsRes.error) throw new Error(`repos: ${repoCountsRes.error.message}`);

  const members = (membersRes.data ?? []) as Array<{
    id: string;
    user_id: string;
    name: string | null;
    email: string | null;
    role: string | null;
  }>;
  const integrations = (integrationsRes.data ?? []) as Array<{
    id: string;
    user_id: string;
    provider: ProviderSlug;
    external_account_handle: string | null;
    status: string;
    last_sync_at: string | null;
    token_expires_at: string | null;
  }>;
  const repoCounts = (repoCountsRes.data ?? []) as Array<{ user_integration_id: string }>;

  // integration.id → accessible repo count
  const repoCountById = new Map<string, number>();
  for (const row of repoCounts) {
    repoCountById.set(row.user_integration_id, (repoCountById.get(row.user_integration_id) ?? 0) + 1);
  }

  const providers: Record<ProviderSlug, V2ProviderSummary> = {
    github: { provider: 'github', connectedCount: 0, totalMemberCount: members.length, members: [] },
    fireflies: { provider: 'fireflies', connectedCount: 0, totalMemberCount: members.length, members: [] },
  };

  const memberByUserId = new Map(members.map((m) => [m.user_id, m]));

  for (const intg of integrations) {
    const summary = providers[intg.provider];
    if (!summary) continue;
    const member = memberByUserId.get(intg.user_id);
    if (intg.status === 'active') summary.connectedCount++;
    summary.members.push({
      userId: intg.user_id,
      name: member?.name ?? null,
      email: member?.email ?? null,
      role: member?.role ?? null,
      externalAccountHandle: intg.external_account_handle,
      status: intg.status,
      lastSyncAt: intg.last_sync_at,
      tokenExpiresAt: intg.token_expires_at,
      accessibleRepoCount: repoCountById.get(intg.id) ?? 0,
    });
  }

  return { flow: 'v2', providers };
}

async function buildLegacyStatus(
  admin: ReturnType<typeof getSupabaseAdmin>,
  teamId: string
): Promise<{
  flow: 'legacy';
  providers: Record<ProviderSlug, { connected: boolean; lastSyncAt: string | null; oauthUser: string | null; trackedRepoCount: number }>;
}> {
  const { data, error } = await admin
    .from('integrations')
    .select('provider, status, last_sync_at, config')
    .eq('team_id', teamId);
  if (error) throw new Error(`integrations: ${error.message}`);

  const providers: Record<ProviderSlug, { connected: boolean; lastSyncAt: string | null; oauthUser: string | null; trackedRepoCount: number }> = {
    github: { connected: false, lastSyncAt: null, oauthUser: null, trackedRepoCount: 0 },
    fireflies: { connected: false, lastSyncAt: null, oauthUser: null, trackedRepoCount: 0 },
  };

  for (const row of data ?? []) {
    const slug = row.provider as ProviderSlug;
    if (!providers[slug]) continue;
    if (row.status !== 'active') continue;
    const cfg = (row.config ?? {}) as Record<string, unknown>;
    providers[slug] = {
      connected: true,
      lastSyncAt: row.last_sync_at,
      oauthUser: (cfg.oauth_user as string) ?? (cfg.account_name as string) ?? null,
      trackedRepoCount: Array.isArray(cfg.tracked_repos) ? (cfg.tracked_repos as unknown[]).length : 0,
    };
  }

  return { flow: 'legacy', providers };
}
