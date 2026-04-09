import { NextResponse } from 'next/server';
import { getAuthContext, requireRole } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase-server';

interface RouteContext {
  params: Promise<{ teamId: string; memberId: string }>;
}

/**
 * PATCH /api/teams/[teamId]/members/[memberId]
 * Update a member's role. Owner only.
 */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { teamId, memberId } = await context.params;
    const ctx = await getAuthContext(teamId);

    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!requireRole(ctx, 'owner')) {
      return NextResponse.json({ error: 'Only the team owner can change roles' }, { status: 403 });
    }

    const { role } = await request.json();

    if (!role || !['manager', 'developer'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role. Must be "manager" or "developer".' }, { status: 400 });
    }

    // Cannot change own role
    if (memberId === ctx.memberId) {
      return NextResponse.json({ error: 'Cannot change your own role' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    // Verify target member exists and is not an owner
    const { data: target } = await admin
      .from('team_members')
      .select('id, role')
      .eq('id', memberId)
      .eq('team_id', teamId)
      .single();

    if (!target) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    if (target.role === 'owner') {
      return NextResponse.json({ error: 'Cannot change the owner\'s role' }, { status: 400 });
    }

    const { error } = await admin
      .from('team_members')
      .update({ role })
      .eq('id', memberId)
      .eq('team_id', teamId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/teams/[teamId]/members/[memberId]
 * Remove a member from the team. Owner or Manager (cannot remove owner or self).
 */
export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { teamId, memberId } = await context.params;
    const ctx = await getAuthContext(teamId);

    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!requireRole(ctx, 'owner', 'manager')) {
      return NextResponse.json({ error: 'Only owners and managers can remove members' }, { status: 403 });
    }

    // Cannot remove self
    if (memberId === ctx.memberId) {
      return NextResponse.json({ error: 'Cannot remove yourself from the team' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    // Verify target member exists and is not an owner
    const { data: target } = await admin
      .from('team_members')
      .select('id, role')
      .eq('id', memberId)
      .eq('team_id', teamId)
      .single();

    if (!target) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    if (target.role === 'owner') {
      return NextResponse.json({ error: 'Cannot remove the team owner' }, { status: 400 });
    }

    // Managers cannot remove other managers
    if (ctx.role === 'manager' && target.role === 'manager') {
      return NextResponse.json({ error: 'Managers cannot remove other managers' }, { status: 403 });
    }

    const { error } = await admin
      .from('team_members')
      .delete()
      .eq('id', memberId)
      .eq('team_id', teamId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
