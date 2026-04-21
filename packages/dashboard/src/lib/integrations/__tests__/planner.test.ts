import { describe, it, expect, beforeAll } from 'vitest';
import { randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { planTokenAssignments } from '../user-integrations';

beforeAll(() => {
  process.env.EVALUATEAI_ENCRYPTION_KEY = randomBytes(32).toString('base64');
});

/**
 * Minimal fake for the Supabase client's fluent .from().select().eq().eq()
 * pattern. Rather than mocking every method, we intercept at .from() and
 * return a builder that resolves to a canned result when awaited.
 */
function makeFakeAdmin(handlers: {
  tracked: Array<{ repo_full_name: string; last_sync_at: string | null }>;
  integrations: Array<{ id: string; user_id: string; rate_limit_remaining: number | null }>;
  access: Array<{ user_integration_id: string; repo_full_name: string }>;
}): SupabaseClient {
  const builder = (data: unknown) => {
    const b: Record<string, unknown> = {
      select: () => b,
      eq: () => b,
      in: () => b,
      then: (resolve: (v: unknown) => unknown) => resolve({ data, error: null }),
    };
    return b;
  };

  return {
    from(table: string) {
      if (table === 'team_tracked_repos') return builder(handlers.tracked);
      if (table === 'user_integrations') return builder(handlers.integrations);
      if (table === 'user_integration_repos') return builder(handlers.access);
      return builder([]);
    },
  } as unknown as SupabaseClient;
}

const TEAM = 'team-1';
const PROVIDER = 'github' as const;

describe('planTokenAssignments', () => {
  it('returns empty when there are no tracked repos', async () => {
    const admin = makeFakeAdmin({ tracked: [], integrations: [], access: [] });
    const plan = await planTokenAssignments(admin, TEAM, PROVIDER);
    expect(plan.assignments).toEqual([]);
    expect(plan.uncovered).toEqual([]);
  });

  it('marks repos with no token access as uncovered', async () => {
    const admin = makeFakeAdmin({
      tracked: [{ repo_full_name: 'acme/abandoned', last_sync_at: null }],
      integrations: [{ id: 'u1', user_id: 'user-alice', rate_limit_remaining: 5000 }],
      access: [], // nobody can see this repo
    });
    const plan = await planTokenAssignments(admin, TEAM, PROVIDER);
    expect(plan.assignments).toEqual([]);
    expect(plan.uncovered).toEqual(['acme/abandoned']);
  });

  it('assigns rare repos first, then common', async () => {
    const admin = makeFakeAdmin({
      tracked: [
        { repo_full_name: 'acme/public', last_sync_at: null },
        { repo_full_name: 'acme/private', last_sync_at: null },
      ],
      integrations: [
        { id: 'u1', user_id: 'alice', rate_limit_remaining: 5000 },
        { id: 'u2', user_id: 'bob', rate_limit_remaining: 5000 },
      ],
      access: [
        { user_integration_id: 'u1', repo_full_name: 'acme/public' },
        { user_integration_id: 'u2', repo_full_name: 'acme/public' },
        { user_integration_id: 'u1', repo_full_name: 'acme/private' }, // only alice
      ],
    });
    const plan = await planTokenAssignments(admin, TEAM, PROVIDER);
    expect(plan.uncovered).toEqual([]);

    // 'acme/private' (rare, 1 user) must be assigned first, so Alice gets it.
    // Her budget is then decremented, so 'acme/public' should go to Bob.
    const byRepo = new Map(plan.assignments.map((a) => [a.repoFullName, a.userId]));
    expect(byRepo.get('acme/private')).toBe('alice');
    expect(byRepo.get('acme/public')).toBe('bob');
  });

  it('picks the token with the most remaining budget among candidates', async () => {
    const admin = makeFakeAdmin({
      tracked: [{ repo_full_name: 'acme/shared', last_sync_at: null }],
      integrations: [
        { id: 'u1', user_id: 'low', rate_limit_remaining: 100 },
        { id: 'u2', user_id: 'high', rate_limit_remaining: 4900 },
        { id: 'u3', user_id: 'med', rate_limit_remaining: 2500 },
      ],
      access: [
        { user_integration_id: 'u1', repo_full_name: 'acme/shared' },
        { user_integration_id: 'u2', repo_full_name: 'acme/shared' },
        { user_integration_id: 'u3', repo_full_name: 'acme/shared' },
      ],
    });
    const plan = await planTokenAssignments(admin, TEAM, PROVIDER);
    expect(plan.assignments).toHaveLength(1);
    expect(plan.assignments[0].userId).toBe('high');
  });

  it('treats null rate_limit_remaining as full budget (Infinity)', async () => {
    const admin = makeFakeAdmin({
      tracked: [{ repo_full_name: 'acme/r', last_sync_at: null }],
      integrations: [
        { id: 'u1', user_id: 'high', rate_limit_remaining: 4900 },
        { id: 'u2', user_id: 'unknown', rate_limit_remaining: null },
      ],
      access: [
        { user_integration_id: 'u1', repo_full_name: 'acme/r' },
        { user_integration_id: 'u2', repo_full_name: 'acme/r' },
      ],
    });
    const plan = await planTokenAssignments(admin, TEAM, PROVIDER);
    // null budget ≈ Infinity > 4900, so 'unknown' wins
    expect(plan.assignments[0].userId).toBe('unknown');
  });

  it('within same rarity bucket, older last_sync_at wins (freshness)', async () => {
    const oldRepo = { repo_full_name: 'acme/old', last_sync_at: '2026-01-01T00:00:00Z' };
    const newRepo = { repo_full_name: 'acme/new', last_sync_at: '2026-04-01T00:00:00Z' };
    const admin = makeFakeAdmin({
      tracked: [newRepo, oldRepo],
      integrations: [{ id: 'u1', user_id: 'alice', rate_limit_remaining: 5000 }],
      access: [
        { user_integration_id: 'u1', repo_full_name: 'acme/old' },
        { user_integration_id: 'u1', repo_full_name: 'acme/new' },
      ],
    });
    const plan = await planTokenAssignments(admin, TEAM, PROVIDER);
    // Both rare (1 user). Older should appear first in assignment order.
    expect(plan.assignments.map((a) => a.repoFullName)).toEqual(['acme/old', 'acme/new']);
  });

  it('spreads load when all repos are equally accessible and budgets are tied', async () => {
    const admin = makeFakeAdmin({
      tracked: [
        { repo_full_name: 'r1', last_sync_at: null },
        { repo_full_name: 'r2', last_sync_at: null },
        { repo_full_name: 'r3', last_sync_at: null },
      ],
      integrations: [
        { id: 'u1', user_id: 'alice', rate_limit_remaining: 5000 },
        { id: 'u2', user_id: 'bob', rate_limit_remaining: 5000 },
      ],
      access: [
        { user_integration_id: 'u1', repo_full_name: 'r1' },
        { user_integration_id: 'u1', repo_full_name: 'r2' },
        { user_integration_id: 'u1', repo_full_name: 'r3' },
        { user_integration_id: 'u2', repo_full_name: 'r1' },
        { user_integration_id: 'u2', repo_full_name: 'r2' },
        { user_integration_id: 'u2', repo_full_name: 'r3' },
      ],
    });
    const plan = await planTokenAssignments(admin, TEAM, PROVIDER);
    // Both users' budgets decrement as repos are assigned, so load should
    // alternate. At minimum we should see both users get at least one repo.
    const users = new Set(plan.assignments.map((a) => a.userId));
    expect(users.size).toBe(2);
  });
});
