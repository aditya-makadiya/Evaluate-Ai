import { getSupabaseServer } from './supabase-ssr';
import { getSupabaseAdmin } from './supabase-server';

export type PlatformRole = 'admin' | 'super_admin';

export interface AdminAuthContext {
  userId: string;
  email: string;
  name: string;
  platformRole: PlatformRole;
}

/**
 * Get the authenticated admin user's context.
 * Checks Supabase session, then verifies platform_roles membership.
 * Returns null if not authenticated or not a platform admin.
 */
export async function getAdminAuthContext(): Promise<AdminAuthContext | null> {
  try {
    const supabase = await getSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const admin = getSupabaseAdmin();
    const { data: platformRole } = await admin
      .from('platform_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (!platformRole) return null;

    return {
      userId: user.id,
      email: user.email ?? '',
      name: user.user_metadata?.name ?? user.email ?? '',
      platformRole: platformRole.role as PlatformRole,
    };
  } catch {
    return null;
  }
}

/**
 * Check if the admin context exists. Returns true if the user is a platform admin.
 */
export function requirePlatformAdmin(ctx: AdminAuthContext | null): ctx is AdminAuthContext {
  return ctx !== null;
}
