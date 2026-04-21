/**
 * Attribution helpers — map provider-side identities to internal
 * team_members rows.
 *
 * Resolution is **deterministic-first, fuzzy-last**. Each helper tries a
 * stable external id before falling back to softer signals like username
 * or name-matching. That ordering is the whole point of Phase 4: stop
 * depending on onboarding typos being correct.
 *
 *   GitHub:     github_user_id (OAuth numeric id) → github_username → email
 *   Fireflies:  organizer_email → fuzzy participant name
 *
 * The helpers short-circuit on the first hit and never fall through for
 * free — which matters because each miss is a DB round-trip and sync
 * handlers call these per ingested commit/PR/meeting.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface GitHubAuthorSignals {
  /** GitHub numeric user id (string form of the `id` field). Stable across renames. */
  authorId?: string | null;
  /** GitHub `login`. Fragile; people rename themselves. */
  username?: string | null;
  /** Commit email, if present. */
  email?: string | null;
}

/**
 * Returns the `team_members.id` to use for `code_changes.developer_id`, or
 * `null` if nothing matched.
 */
export async function resolveGitHubDeveloper(
  admin: SupabaseClient,
  teamId: string,
  signals: GitHubAuthorSignals
): Promise<string | null> {
  const { authorId, username, email } = signals;

  if (authorId) {
    const { data } = await admin
      .from('team_members')
      .select('id')
      .eq('team_id', teamId)
      .eq('github_user_id', authorId)
      .maybeSingle();
    if (data?.id) return data.id as string;
  }

  if (username) {
    const { data } = await admin
      .from('team_members')
      .select('id')
      .eq('team_id', teamId)
      .ilike('github_username', username)
      .maybeSingle();
    if (data?.id) return data.id as string;
  }

  if (email) {
    const { data } = await admin
      .from('team_members')
      .select('id')
      .eq('team_id', teamId)
      .ilike('email', email)
      .maybeSingle();
    if (data?.id) return data.id as string;
  }

  return null;
}

export interface TeamMemberLite {
  id: string;
  name: string | null;
  email: string | null;
}

export interface FirefliesParticipantSignals {
  /** Meeting organizer's email — most reliable signal Fireflies gives us. */
  organizerEmail?: string | null;
  /** Participant display name from transcript.participants. Fuzzy. */
  name?: string | null;
}

/**
 * Match a participant against a *pre-loaded* team member list.
 *
 * The meeting processor loads team_members once per meeting; we avoid a
 * round-trip per participant by doing the match in-memory. Deterministic
 * email hit wins; the fuzzy name match is a last resort that mirrors the
 * legacy behavior so we don't regress attribution for meetings whose
 * participants don't carry emails.
 */
export function resolveFirefliesParticipant(
  members: TeamMemberLite[],
  signals: FirefliesParticipantSignals
): string | null {
  const email = signals.organizerEmail?.toLowerCase().trim();
  if (email) {
    const byEmail = members.find((m) => (m.email ?? '').toLowerCase().trim() === email);
    if (byEmail) return byEmail.id;
  }

  const rawName = signals.name?.toLowerCase().trim();
  if (!rawName) return null;

  const matched = members.find((m) => {
    const memberName = (m.name ?? '').toLowerCase().trim();
    if (!memberName) return false;
    return (
      memberName === rawName ||
      memberName.includes(rawName) ||
      rawName.includes(memberName) ||
      memberName.split(' ')[0] === rawName.split(' ')[0]
    );
  });
  return matched?.id ?? null;
}

/**
 * Writes `github_user_id` back to the team_members row for this user.
 * Intentionally permissive — failures log and return false rather than
 * throwing, because attribution writeback should never block the
 * user-visible OAuth connection flow.
 */
export async function writeGitHubUserId(
  admin: SupabaseClient,
  teamId: string,
  authUserId: string,
  githubUserId: string
): Promise<boolean> {
  const { error } = await admin
    .from('team_members')
    .update({ github_user_id: githubUserId })
    .eq('team_id', teamId)
    .eq('user_id', authUserId);
  return !error;
}
