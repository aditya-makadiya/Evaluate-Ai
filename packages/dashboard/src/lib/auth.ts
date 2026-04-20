import { createHash } from 'node:crypto';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { getSupabaseServer } from './supabase-ssr';
import { getSupabaseAdmin } from './supabase-server';

export type TeamRole = 'owner' | 'manager' | 'developer';

export interface AuthContext {
  userId: string;
  email: string;
  name: string;
  teamId: string;
  teamName: string;
  teamCode: string;
  role: TeamRole;
  memberId: string;
}

/**
 * Get the authenticated user's context.
 * Supports two auth methods:
 *   1. Supabase session cookie (dashboard browser sessions)
 *   2. CLI Bearer token (CLI commands via Authorization header)
 * Returns null if not authenticated or not a member of any team.
 */
export async function getAuthContext(teamId?: string): Promise<AuthContext | null> {
  // Try CLI token auth first (Bearer token in Authorization header)
  const cliCtx = await getAuthFromCliToken(teamId);
  if (cliCtx) return cliCtx;

  // Fall back to Supabase session cookie auth
  return getAuthFromSession(teamId);
}

/**
 * Authenticate via CLI Bearer token.
 */
async function getAuthFromCliToken(teamId?: string): Promise<AuthContext | null> {
  try {
    const headerStore = await headers();
    const authHeader = headerStore.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return null;

    const token = authHeader.slice(7);
    if (!token.startsWith('eai_')) return null;

    const tokenHash = createHash('sha256').update(token).digest('hex');
    const admin = getSupabaseAdmin();

    const { data: cliToken } = await admin
      .from('cli_tokens')
      .select('user_id, team_id, member_id, revoked_at')
      .eq('token_hash', tokenHash)
      .single();

    if (!cliToken || cliToken.revoked_at) return null;

    const resolvedTeamId = teamId || cliToken.team_id;

    const [{ data: member }, { data: team }] = await Promise.all([
      admin.from('team_members').select('id, role, email, name').eq('id', cliToken.member_id).single(),
      admin.from('teams').select('id, name, team_code').eq('id', resolvedTeamId).single(),
    ]);

    if (!member || !team) return null;

    // Update last_used_at (fire-and-forget)
    admin.from('cli_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('token_hash', tokenHash)
      .then(() => {});

    return {
      userId: cliToken.user_id,
      email: member.email ?? '',
      name: member.name ?? '',
      teamId: team.id,
      teamName: team.name,
      teamCode: team.team_code ?? '',
      role: member.role as TeamRole,
      memberId: member.id,
    };
  } catch {
    return null;
  }
}

/**
 * Authenticate via Supabase session cookie.
 */
async function getAuthFromSession(teamId?: string): Promise<AuthContext | null> {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = getSupabaseAdmin();

  let memberQuery = admin
    .from('team_members')
    .select('id, role, team_id')
    .eq('user_id', user.id);

  if (teamId) {
    memberQuery = memberQuery.eq('team_id', teamId);
  }

  const { data: members } = await memberQuery.limit(1);
  const member = members?.[0];
  if (!member) return null;

  const { data: team } = await admin
    .from('teams')
    .select('id, name, team_code')
    .eq('id', member.team_id)
    .single();

  if (!team) return null;

  return {
    userId: user.id,
    email: user.email ?? '',
    name: user.user_metadata?.name ?? user.email ?? '',
    teamId: team.id,
    teamName: team.name,
    teamCode: team.team_code ?? '',
    role: member.role as TeamRole,
    memberId: member.id,
  };
}

/**
 * Check if the auth context has one of the allowed roles.
 */
export function requireRole(ctx: AuthContext, ...allowed: TeamRole[]): boolean {
  return allowed.includes(ctx.role);
}

export interface GuardOptions {
  /** If provided, the request is rejected unless this teamId matches ctx.teamId. */
  teamId?: string | null;
  /** If provided, only these roles are allowed. Empty/omitted allows any authenticated member. */
  roles?: TeamRole[];
}

export type GuardResult =
  | { ctx: AuthContext; response?: undefined }
  | { ctx?: undefined; response: NextResponse };

/**
 * Single guard for API routes: authenticates, validates tenant, and enforces role.
 *
 * Usage:
 *   const guard = await guardApi({ teamId, roles: ['owner', 'manager'] });
 *   if (guard.response) return guard.response;
 *   const ctx = guard.ctx;
 */
export async function guardApi(opts: GuardOptions = {}): Promise<GuardResult> {
  const ctx = await getAuthContext();
  if (!ctx) {
    return {
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  if (opts.teamId && opts.teamId !== ctx.teamId) {
    return {
      response: NextResponse.json({ error: 'Forbidden: team mismatch' }, { status: 403 }),
    };
  }

  if (opts.roles && opts.roles.length > 0 && !opts.roles.includes(ctx.role)) {
    return {
      response: NextResponse.json(
        { error: `Forbidden: requires ${opts.roles.join(' or ')}` },
        { status: 403 }
      ),
    };
  }

  return { ctx };
}
