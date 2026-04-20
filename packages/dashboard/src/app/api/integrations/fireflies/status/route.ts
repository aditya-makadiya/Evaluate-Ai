import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import { guardApi } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const teamId = request.nextUrl.searchParams.get('team_id');
    if (!teamId) {
      return NextResponse.json({ error: 'team_id is required' }, { status: 400 });
    }

    const guard = await guardApi({ teamId });
    if (guard.response) return guard.response;

    const supabase = getSupabaseAdmin();

    const { data: integration } = await supabase
      .from('integrations')
      .select('id, status, config, last_sync_at')
      .eq('team_id', teamId)
      .eq('provider', 'fireflies')
      .eq('status', 'active')
      .single();

    if (!integration) {
      return NextResponse.json({ connected: false });
    }

    const config = integration.config as Record<string, unknown> | null;

    return NextResponse.json({
      connected: true,
      connectedAt: config?.connected_at ?? null,
      accountEmail: config?.account_email ?? null,
      accountName: config?.account_name ?? null,
      lastSyncAt: integration.last_sync_at,
    });
  } catch (err) {
    console.error('Fireflies status error:', err);
    return NextResponse.json({ connected: false });
  }
}
