import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase-server';

interface RouteContext {
  params: Promise<{ teamId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { teamId } = await context.params;
    const ctx = await getAuthContext(teamId);
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabaseAdmin();

    const { data: team, error } = await supabase
      .from('teams')
      .select('*')
      .eq('id', teamId)
      .single();

    if (error || !team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // Get member count
    const { count } = await supabase
      .from('team_members')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', teamId);

    return NextResponse.json({
      team: {
        id: team.id,
        name: team.name,
        slug: team.slug,
        createdAt: team.created_at,
        updatedAt: team.updated_at,
        memberCount: count ?? 0,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { teamId } = await context.params;
    const ctx = await getAuthContext(teamId);
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const supabase = getSupabaseAdmin();

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.slug !== undefined) updates.slug = body.slug;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    const { data: team, error } = await supabase
      .from('teams')
      .update(updates)
      .eq('id', teamId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      team: {
        id: team.id,
        name: team.name,
        slug: team.slug,
        createdAt: team.created_at,
        updatedAt: team.updated_at,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
