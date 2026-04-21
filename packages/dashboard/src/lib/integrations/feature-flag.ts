/**
 * Per-team kill-switch for the per-user integrations flow.
 *
 * Default: **v2 is on** for every team. Only teams that have explicitly
 * opted out via `settings.multi_user_integrations_enabled: false` take
 * the legacy path. This is the post-rollout shape — v2 is the product,
 * legacy is the emergency rollback lever.
 *
 * Kept in a tiny per-request memo — a single request can check the flag
 * multiple times (connect+upsert+audit-log) and we don't want three
 * round-trips for one value.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const cache = new WeakMap<SupabaseClient, Map<string, boolean>>();

export async function isMultiUserEnabled(
  admin: SupabaseClient,
  teamId: string
): Promise<boolean> {
  let perClient = cache.get(admin);
  if (!perClient) {
    perClient = new Map();
    cache.set(admin, perClient);
  }
  const hit = perClient.get(teamId);
  if (hit !== undefined) return hit;

  const { data, error } = await admin
    .from('teams')
    .select('settings')
    .eq('id', teamId)
    .single();

  if (error || !data) {
    // Team lookup failed — conservatively fall back to the legacy path so
    // broken infra doesn't silently change attribution. The cache stores
    // only the successful reads.
    return false;
  }

  const settings = (data.settings ?? {}) as Record<string, unknown>;
  // Default ON: only an explicit `false` opts out.
  const enabled = settings.multi_user_integrations_enabled !== false;
  perClient.set(teamId, enabled);
  return enabled;
}
