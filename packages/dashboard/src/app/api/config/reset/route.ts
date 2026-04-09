import { NextResponse } from 'next/server';
import { getAuthContext, requireRole } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase-server';

export async function POST() {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only owners can reset data
    if (!requireRole(ctx, 'owner')) {
      return NextResponse.json({ error: 'Forbidden — only team owners can reset data' }, { status: 403 });
    }

    const teamId = ctx.teamId;
    const supabase = getSupabaseAdmin();

    // Delete all config entries for the team
    const { error } = await supabase
      .from('config')
      .delete()
      .eq('team_id', teamId);

    if (error) {
      console.error('Config reset error:', error);
      return NextResponse.json({ error: 'Reset failed' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Config reset successfully' });
  } catch (err) {
    console.error('Config reset error:', err);
    return NextResponse.json({ error: 'Reset failed' }, { status: 500 });
  }
}
