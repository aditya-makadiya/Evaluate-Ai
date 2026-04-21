import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  resolveGitHubDeveloper,
  resolveFirefliesParticipant,
  writeGitHubUserId,
} from '../attribution';

/**
 * Fake admin builder: configurable handler per (table, column) so the test
 * can control which lookup hits. Returns a SupabaseClient-shaped object
 * that supports the chain .from().select().eq().eq().ilike().maybeSingle().
 */
function makeFakeAdmin(responses: {
  byGithubUserId?: { id: string } | null;
  byGithubUsername?: { id: string } | null;
  byEmail?: { id: string } | null;
  updateOk?: boolean;
}): { admin: SupabaseClient; calls: { column: string }[] } {
  const calls: { column: string }[] = [];

  const chain = (initial: { column: string }) => {
    const ctx: { column: string } = { column: initial.column };
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (col: string, _val: unknown) => {
        if (col === 'github_user_id') ctx.column = 'github_user_id';
        if (col === 'team_id' || col === 'user_id') {
          // don't override column signal
        }
        return builder;
      },
      ilike: (col: string) => {
        ctx.column = col;
        return builder;
      },
      maybeSingle: async () => {
        calls.push({ column: ctx.column });
        if (ctx.column === 'github_user_id') {
          return { data: responses.byGithubUserId ?? null, error: null };
        }
        if (ctx.column === 'github_username') {
          return { data: responses.byGithubUsername ?? null, error: null };
        }
        if (ctx.column === 'email') {
          return { data: responses.byEmail ?? null, error: null };
        }
        return { data: null, error: null };
      },
      update: () => builder,
      then: () => undefined,
    };
    return builder;
  };

  const admin = {
    from() {
      const builder: Record<string, unknown> = {
        select: () => chain({ column: 'none' }),
        update: () => ({
          eq: () => {
            const b: Record<string, unknown> = {
              eq: () => b,
              then: (resolve: (v: unknown) => unknown) =>
                resolve({ error: responses.updateOk === false ? { message: 'x' } : null }),
            };
            return b;
          },
        }),
      };
      return builder;
    },
  } as unknown as SupabaseClient;

  return { admin, calls };
}

describe('resolveGitHubDeveloper', () => {
  it('short-circuits on github_user_id hit (no other queries)', async () => {
    const { admin, calls } = makeFakeAdmin({
      byGithubUserId: { id: 'member-1' },
      byGithubUsername: { id: 'wrong' },
      byEmail: { id: 'wrong' },
    });
    const id = await resolveGitHubDeveloper(admin, 'team-1', {
      authorId: '4472831',
      username: 'alice',
      email: 'alice@acme.com',
    });
    expect(id).toBe('member-1');
    expect(calls).toHaveLength(1);
    expect(calls[0].column).toBe('github_user_id');
  });

  it('falls back to github_username when id missing', async () => {
    const { admin, calls } = makeFakeAdmin({
      byGithubUserId: null,
      byGithubUsername: { id: 'member-2' },
      byEmail: { id: 'wrong' },
    });
    const id = await resolveGitHubDeveloper(admin, 'team-1', {
      authorId: null,
      username: 'alice-dev-99',
      email: 'alice@acme.com',
    });
    expect(id).toBe('member-2');
  });

  it('falls back to email when id and username miss', async () => {
    const { admin } = makeFakeAdmin({
      byGithubUserId: null,
      byGithubUsername: null,
      byEmail: { id: 'member-3' },
    });
    const id = await resolveGitHubDeveloper(admin, 'team-1', {
      authorId: null,
      username: 'unknown',
      email: 'alice@acme.com',
    });
    expect(id).toBe('member-3');
  });

  it('returns null when no signal matches', async () => {
    const { admin } = makeFakeAdmin({
      byGithubUserId: null,
      byGithubUsername: null,
      byEmail: null,
    });
    const id = await resolveGitHubDeveloper(admin, 'team-1', {
      authorId: '0',
      username: 'ghost',
      email: 'ghost@nowhere.com',
    });
    expect(id).toBeNull();
  });

  it('returns null when no signals provided', async () => {
    const { admin, calls } = makeFakeAdmin({});
    const id = await resolveGitHubDeveloper(admin, 'team-1', {});
    expect(id).toBeNull();
    expect(calls).toHaveLength(0); // no DB hits if nothing to look up
  });

  it('skips id lookup when authorId is null but still tries username', async () => {
    const { admin, calls } = makeFakeAdmin({
      byGithubUsername: { id: 'member-x' },
    });
    const id = await resolveGitHubDeveloper(admin, 'team-1', {
      username: 'alice',
    });
    expect(id).toBe('member-x');
    expect(calls).toHaveLength(1);
    expect(calls[0].column).toBe('github_username');
  });
});

describe('resolveFirefliesParticipant', () => {
  const members = [
    { id: 'alice', name: 'Alice Smith', email: 'alice@acme.com' },
    { id: 'bob', name: 'Bob Jones', email: 'bob@acme.com' },
    { id: 'charlie', name: 'Charlie Brown', email: 'c.brown@acme.com' },
  ];

  it('matches by organizer email deterministically', () => {
    const id = resolveFirefliesParticipant(members, {
      organizerEmail: 'alice@acme.com',
      name: 'Someone Else Entirely',
    });
    expect(id).toBe('alice');
  });

  it('is case-insensitive for email matching', () => {
    const id = resolveFirefliesParticipant(members, {
      organizerEmail: 'ALICE@acme.com',
    });
    expect(id).toBe('alice');
  });

  it('falls back to exact name match', () => {
    const id = resolveFirefliesParticipant(members, { name: 'Bob Jones' });
    expect(id).toBe('bob');
  });

  it('falls back to first-name match', () => {
    const id = resolveFirefliesParticipant(members, { name: 'charlie' });
    expect(id).toBe('charlie');
  });

  it('falls back to substring match', () => {
    const id = resolveFirefliesParticipant(members, { name: 'Alice' });
    expect(id).toBe('alice');
  });

  it('returns null when no signal matches', () => {
    const id = resolveFirefliesParticipant(members, { name: 'Dan Unknown' });
    expect(id).toBeNull();
  });

  it('returns null with empty signals', () => {
    const id = resolveFirefliesParticipant(members, {});
    expect(id).toBeNull();
  });
});

describe('writeGitHubUserId', () => {
  it('returns true on successful update', async () => {
    const { admin } = makeFakeAdmin({ updateOk: true });
    const ok = await writeGitHubUserId(admin, 'team-1', 'auth-1', '4472831');
    expect(ok).toBe(true);
  });

  it('returns false on update error (does not throw)', async () => {
    const { admin } = makeFakeAdmin({ updateOk: false });
    const ok = await writeGitHubUserId(admin, 'team-1', 'auth-1', '4472831');
    expect(ok).toBe(false);
  });
});

// Silence noisy logger during test runs
vi.mock('../logger', () => ({ logIntegration: () => undefined }));
