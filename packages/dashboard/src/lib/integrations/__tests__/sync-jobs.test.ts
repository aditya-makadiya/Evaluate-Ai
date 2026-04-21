import { describe, it, expect, beforeAll } from 'vitest';
import { randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createOrGetActiveJob } from '../sync-jobs';

beforeAll(() => {
  process.env.EVALUATEAI_ENCRYPTION_KEY = randomBytes(32).toString('base64');
});

/**
 * Tiny fake for the admin client. Records inserts and returns canned reads
 * so we can exercise the debounce path deterministically.
 */
function makeFakeAdmin(opts: {
  existingActiveJob?: { id: string; status: string } | null;
  onInsert?: (row: Record<string, unknown>) => Record<string, unknown>;
}): SupabaseClient {
  let inserted: Record<string, unknown> | null = null;

  const readBuilder = {
    select: () => readBuilder,
    eq: () => readBuilder,
    in: () => readBuilder,
    order: () => readBuilder,
    limit: () => readBuilder,
    maybeSingle: async () => ({
      data: opts.existingActiveJob ?? null,
      error: null,
    }),
  } as unknown as Record<string, unknown>;

  const insertBuilder = {
    select: () => insertBuilder,
    single: async () => {
      const row = inserted ?? {};
      return { data: opts.onInsert ? opts.onInsert(row) : row, error: null };
    },
  };

  return {
    from() {
      return {
        select: () => readBuilder,
        insert(row: Record<string, unknown>) {
          inserted = { id: 'new-job-id', ...row, status: 'pending' };
          return insertBuilder;
        },
      };
    },
  } as unknown as SupabaseClient;
}

describe('createOrGetActiveJob', () => {
  it('returns existing pending job without inserting (debounce)', async () => {
    const existing = { id: 'job-existing', status: 'pending' };
    const admin = makeFakeAdmin({ existingActiveJob: existing });
    const { job, reused } = await createOrGetActiveJob(admin, 'team-1', 'github', 'user-1');
    expect(reused).toBe(true);
    expect(job.id).toBe('job-existing');
  });

  it('returns existing running job without inserting', async () => {
    const existing = { id: 'job-running', status: 'running' };
    const admin = makeFakeAdmin({ existingActiveJob: existing });
    const { job, reused } = await createOrGetActiveJob(admin, 'team-1', 'github', 'user-1');
    expect(reused).toBe(true);
    expect(job.id).toBe('job-running');
  });

  it('inserts a fresh job when none is active', async () => {
    const admin = makeFakeAdmin({ existingActiveJob: null });
    const { job, reused } = await createOrGetActiveJob(admin, 'team-1', 'github', 'user-1');
    expect(reused).toBe(false);
    expect(job.id).toBe('new-job-id');
    expect(job.status).toBe('pending');
  });
});
