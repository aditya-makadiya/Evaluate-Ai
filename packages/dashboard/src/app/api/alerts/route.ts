import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, requireRole } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const teamId = ctx.teamId;
    const unreadOnly = searchParams.get('unread_only') === 'true';
    const limit = parseInt(searchParams.get('limit') ?? '20', 10);

    let query = supabase
      .from('alerts')
      .select('id, team_id, type, severity, title, description, developer_id, task_id, is_read, is_dismissed, created_at')
      .eq('team_id', teamId)
      .eq('is_dismissed', false)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (unreadOnly) {
      query = query.eq('is_read', false);
    }

    // Developers only see alerts that concern them (e.g. their own low score,
    // their own cost spike). Team-wide alerts stay visible to managers/owners.
    if (ctx.role === 'developer') {
      query = query.eq('developer_id', ctx.memberId);
    }

    const { data: alerts, error } = await query;

    if (error) {
      console.error('Alerts fetch error:', error);
      return NextResponse.json({ alerts: [] });
    }

    // Get developer names for alerts that have developer_id
    const developerIds = [...new Set((alerts ?? []).map(a => a.developer_id).filter(Boolean))];
    let developerMap: Record<string, string> = {};

    if (developerIds.length > 0) {
      const { data: developers } = await supabase
        .from('team_members')
        .select('id, name')
        .in('id', developerIds);

      developerMap = (developers ?? []).reduce((map, d) => {
        map[d.id] = d.name;
        return map;
      }, {} as Record<string, string>);
    }

    const result = (alerts ?? []).map(a => ({
      id: a.id,
      teamId: a.team_id,
      type: a.type,
      severity: a.severity,
      title: a.title,
      description: a.description,
      developerId: a.developer_id,
      developerName: a.developer_id ? (developerMap[a.developer_id] ?? null) : null,
      taskId: a.task_id,
      isRead: a.is_read,
      isDismissed: a.is_dismissed,
      createdAt: a.created_at,
    }));

    return NextResponse.json({ alerts: result });
  } catch (err) {
    console.error('Alerts API error:', err);
    return NextResponse.json({ alerts: [] });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // RBAC: Only owners and managers can update alerts
    if (!requireRole(ctx, 'owner', 'manager')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const { alertId, action } = body;

    if (!alertId || !action) {
      return NextResponse.json({ error: 'alertId and action are required' }, { status: 400 });
    }

    if (action !== 'read' && action !== 'dismiss') {
      return NextResponse.json({ error: 'action must be "read" or "dismiss"' }, { status: 400 });
    }

    const updateData = action === 'read'
      ? { is_read: true }
      : { is_dismissed: true };

    const { error } = await supabase
      .from('alerts')
      .update(updateData)
      .eq('id', alertId);

    if (error) {
      console.error('Alert update error:', error);
      return NextResponse.json({ error: 'Failed to update alert' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Alerts PUT error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
