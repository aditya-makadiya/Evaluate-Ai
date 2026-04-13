import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import { generateTeamReports } from '@/lib/services/report-generator';

/**
 * GET /api/cron/daily
 *
 * Automated daily cron endpoint — processes ALL teams.
 * Protected by CRON_SECRET (not user auth).
 *
 * Intended for Vercel Cron, GitHub Actions, or any external scheduler.
 * For on-demand single-team generation, use POST /api/dashboard/generate-reports.
 */
export async function GET(req: NextRequest) {
  try {
    const secret =
      req.headers.get('x-cron-secret') ??
      req.headers.get('authorization')?.replace('Bearer ', '');

    if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();

    const { data: teams } = await supabase.from('teams').select('id, name');
    if (!teams || teams.length === 0) {
      return NextResponse.json({
        success: true,
        teamsProcessed: 0,
        reportsGenerated: 0,
        alertsGenerated: 0,
        staleSessionsClosed: 0,
      });
    }

    let totalReports = 0;
    let totalAlerts = 0;
    let totalStaleSessions = 0;

    for (const team of teams) {
      const result = await generateTeamReports(supabase, team.id);
      totalReports += result.reportsGenerated;
      totalAlerts += result.alertsGenerated;
      totalStaleSessions += result.staleSessionsClosed;
    }

    return NextResponse.json({
      success: true,
      teamsProcessed: teams.length,
      reportsGenerated: totalReports,
      alertsGenerated: totalAlerts,
      staleSessionsClosed: totalStaleSessions,
    });
  } catch (err) {
    console.error('Cron daily error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
