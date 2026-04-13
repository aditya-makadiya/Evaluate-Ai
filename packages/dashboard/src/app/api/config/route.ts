import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, requireRole } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase-server';

export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const teamId = ctx.teamId;
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('config')
      .select('key, value, updated_at')
      .eq('team_id', teamId)
      .order('key');

    if (error) {
      console.error('Config GET error:', error);
      return NextResponse.json({});
    }

    const config: Record<string, { value: string; updatedAt: string }> = {};
    for (const row of data ?? []) {
      config[row.key] = { value: row.value, updatedAt: row.updated_at };
    }

    return NextResponse.json(config);
  } catch (err) {
    console.error('Config API error:', err);
    return NextResponse.json({});
  }
}

export async function PUT(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // RBAC: Only owners and managers can change config
  if (!requireRole(ctx, 'owner', 'manager')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const teamId = ctx.teamId;

  let body: { key?: string; value?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { key, value } = body;

  if (!key || typeof key !== 'string' || value === undefined || typeof value !== 'string') {
    return NextResponse.json(
      { error: 'Request body must include "key" (string) and "value" (string)' },
      { status: 400 }
    );
  }

  try {
    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

    const { error } = await supabase
      .from('config')
      .upsert(
        { team_id: teamId, key, value, updated_at: now },
        { onConflict: 'team_id,key' }
      );

    if (error) {
      console.error('Config PUT error:', error);
      return NextResponse.json(
        { error: 'Database write failed' },
        { status: 503 }
      );
    }

    return NextResponse.json({ key, value, updatedAt: now });
  } catch (err) {
    console.error('Config PUT error:', err);
    return NextResponse.json(
      { error: 'Database not available' },
      { status: 503 }
    );
  }
}
