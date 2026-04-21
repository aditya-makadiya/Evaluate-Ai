import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isMultiUserEnabled } from '../feature-flag';

/**
 * Minimal fake admin client: one canned team row with configurable settings
 * (or a forced error). Enough to exercise the default logic.
 */
function makeFakeAdmin(opts: {
  settings?: Record<string, unknown> | null;
  notFound?: boolean;
  dbError?: boolean;
}): SupabaseClient {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    single: async () => {
      if (opts.dbError) return { data: null, error: { message: 'boom' } };
      if (opts.notFound) return { data: null, error: null };
      return { data: { settings: opts.settings ?? {} }, error: null };
    },
  };
  return {
    from: () => builder,
  } as unknown as SupabaseClient;
}

describe('isMultiUserEnabled', () => {
  it('defaults to TRUE when settings object is empty', async () => {
    const admin = makeFakeAdmin({ settings: {} });
    expect(await isMultiUserEnabled(admin, 'team-1')).toBe(true);
  });

  it('defaults to TRUE when settings key is missing', async () => {
    const admin = makeFakeAdmin({ settings: { some_other_flag: 'value' } });
    expect(await isMultiUserEnabled(admin, 'team-2')).toBe(true);
  });

  it('defaults to TRUE when settings is null', async () => {
    const admin = makeFakeAdmin({ settings: null });
    expect(await isMultiUserEnabled(admin, 'team-3')).toBe(true);
  });

  it('returns TRUE when the flag is explicitly true', async () => {
    const admin = makeFakeAdmin({ settings: { multi_user_integrations_enabled: true } });
    expect(await isMultiUserEnabled(admin, 'team-4')).toBe(true);
  });

  it('returns FALSE only when the flag is explicitly false (the opt-out)', async () => {
    const admin = makeFakeAdmin({ settings: { multi_user_integrations_enabled: false } });
    expect(await isMultiUserEnabled(admin, 'team-5')).toBe(false);
  });

  it('falls back to FALSE when the team lookup errors (safety fallback)', async () => {
    const admin = makeFakeAdmin({ dbError: true });
    expect(await isMultiUserEnabled(admin, 'team-6')).toBe(false);
  });

  it('falls back to FALSE when the team row is missing', async () => {
    const admin = makeFakeAdmin({ notFound: true });
    expect(await isMultiUserEnabled(admin, 'team-7')).toBe(false);
  });

  it('treats non-boolean values as "unset" (default TRUE)', async () => {
    const admin = makeFakeAdmin({ settings: { multi_user_integrations_enabled: 'yes' } });
    // Only strict `false` opts out; anything else (even a string) keeps us on v2.
    expect(await isMultiUserEnabled(admin, 'team-8')).toBe(true);
  });
});
