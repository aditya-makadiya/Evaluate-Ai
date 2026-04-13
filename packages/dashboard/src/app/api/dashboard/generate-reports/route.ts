import { NextResponse } from 'next/server';
import { getAuthContext, requireRole } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import { generateTeamReports } from '@/lib/services/report-generator';

/**
 * POST /api/dashboard/generate-reports
 *
 * On-demand report generation for the authenticated user's team.
 * Replaces the need for a cron-based scheduler during development and
 * serves as the "Sync Now" action in the sidebar.
 *
 * Body (optional):
 *   { "date": "2026-04-12" }   — generate for a specific date (defaults to yesterday)
 *
 * Auth: session cookie or CLI Bearer token. Restricted to owner/manager roles.
 */
export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!requireRole(ctx, 'owner', 'manager')) {
    return NextResponse.json(
      { error: 'Only owners and managers can generate reports' },
      { status: 403 },
    );
  }

  let date: string | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    if (body.date && typeof body.date === 'string') {
      // Validate YYYY-MM-DD format
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
        return NextResponse.json(
          { error: 'Invalid date format. Use YYYY-MM-DD.' },
          { status: 400 },
        );
      }
      date = body.date;
    }
  } catch {
    // No body or invalid JSON — use default (yesterday)
  }

  try {
    const supabase = getSupabaseAdmin();
    const result = await generateTeamReports(supabase, ctx.teamId, date);

    return NextResponse.json({
      success: true,
      ...result,
      teamId: ctx.teamId,
    });
  } catch (err) {
    console.error('Generate reports error:', err);
    return NextResponse.json(
      { error: 'Failed to generate reports' },
      { status: 500 },
    );
  }
}
