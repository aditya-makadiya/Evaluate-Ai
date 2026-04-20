import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase-server';

export async function GET() {
  try {
    const ctx = await getAuthContext();

    if (!ctx) {
      // Debug: log why auth context is null to diagnose onboarding redirect
      const { getSupabaseServer } = await import('@/lib/supabase-ssr');
      try {
        const supabase = await getSupabaseServer();
        const { data: { user }, error: authErr } = await supabase.auth.getUser();
        if (!user) {
          console.warn('[/api/auth/me] No Supabase session found.', authErr?.message ?? '');
        } else {
          const admin = getSupabaseAdmin();
          const { data: members, error: memberErr } = await admin
            .from('team_members')
            .select('id, role, team_id, user_id')
            .eq('user_id', user.id)
            .limit(1);
          console.warn(
            `[/api/auth/me] User ${user.email} (${user.id}) has no auth context.`,
            `Members found: ${members?.length ?? 0}`,
            memberErr ? `Error: ${memberErr.message}` : '',
            members?.[0] ? `team_id: ${members[0].team_id}` : 'No team_member row'
          );
        }
      } catch (debugErr) {
        console.warn('[/api/auth/me] Debug logging failed:', debugErr);
      }

      return NextResponse.json({ user: null }, { status: 401 });
    }

    // Look up platform-admin status in the same request so the layout doesn't
    // need a separate /api/admin/me probe (which 403s for every developer and
    // repeats on each auth refresh).
    let platformRole: 'admin' | 'super_admin' | null = null;
    try {
      const admin = getSupabaseAdmin();
      const { data } = await admin
        .from('platform_roles')
        .select('role')
        .eq('user_id', ctx.userId)
        .maybeSingle();
      if (data?.role === 'admin' || data?.role === 'super_admin') {
        platformRole = data.role;
      }
    } catch {
      // Non-fatal: treat as non-admin.
    }

    return NextResponse.json({
      user: {
        id: ctx.userId,
        email: ctx.email,
        name: ctx.name,
        teamId: ctx.teamId,
        teamName: ctx.teamName,
        teamCode: ctx.teamCode,
        role: ctx.role,
        memberId: ctx.memberId,
        platformRole,
        isPlatformAdmin: platformRole !== null,
      },
    });
  } catch (err) {
    console.error('[/api/auth/me] Unexpected error:', err);
    return NextResponse.json({ user: null }, { status: 500 });
  }
}
