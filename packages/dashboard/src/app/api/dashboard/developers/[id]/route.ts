import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase-server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const teamId = ctx.teamId;
    const { id } = await params;

    // RBAC: Developers can only view their own detail
    if (ctx.role === 'developer' && id !== ctx.memberId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabase = getSupabaseAdmin();
    const now = new Date();
    // Week boundaries
    const dayOfWeek = now.getDay() || 7;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - dayOfWeek + 1);
    const weekStartStr = weekStart.toISOString().slice(0, 10);

    // 30 days ago
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);

    // Fetch developer info
    let memberQuery = supabase
      .from('team_members')
      .select('id, name, email, role, github_username, evaluateai_installed')
      .eq('id', id);
    if (teamId) memberQuery = memberQuery.eq('team_id', teamId);
    const { data: member } = await memberQuery.single();

    if (!member) {
      return NextResponse.json({ error: 'Developer not found' }, { status: 404 });
    }

    const devId = member.id;

    // Backfill: if member has sessions but evaluateai_installed is false, fix it
    if (!member.evaluateai_installed) {
      const { count: sessionCount } = await supabase
        .from('ai_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('developer_id', devId)
        .limit(1);
      if (sessionCount && sessionCount > 0) {
        supabase.from('team_members')
          .update({ evaluateai_installed: true })
          .eq('id', devId)
          .then(() => {});
        member.evaluateai_installed = true;
      }
    }

    // Parse session filter params
    const sessionDays = parseInt(request.nextUrl.searchParams.get('sessionDays') ?? '7', 10);
    const sessionLimit = Math.min(parseInt(request.nextUrl.searchParams.get('sessionLimit') ?? '20', 10), 100);
    const sessionOffset = parseInt(request.nextUrl.searchParams.get('sessionOffset') ?? '0', 10);

    // Compute session filter date
    const sessionFilterDate = sessionDays > 0
      ? new Date(now.getTime() - sessionDays * 86400000).toISOString().slice(0, 10)
      : null; // null = all time

    // AI sessions (paginated, filtered by days)
    let sessionsQ = supabase.from('ai_sessions')
      .select('id, model, total_cost_usd, avg_prompt_score, total_turns, total_input_tokens, total_output_tokens, started_at, ended_at, work_summary, work_tags, work_category', { count: 'exact' })
      .eq('developer_id', devId)
      .order('started_at', { ascending: false })
      .range(sessionOffset, sessionOffset + sessionLimit - 1);
    if (sessionFilterDate) sessionsQ = sessionsQ.gte('started_at', sessionFilterDate);
    if (teamId) sessionsQ = sessionsQ.eq('team_id', teamId);
    const { data: paginatedSessions, count: totalSessionCount } = await sessionsQ;

    // Fetch first turn prompt text for paginated sessions
    const paginatedSessionIds = (paginatedSessions ?? []).map(s => s.id);
    const sessionFirstPrompts: Record<string, string> = {};
    if (paginatedSessionIds.length > 0) {
      const { data: turns } = await supabase
        .from('ai_turns')
        .select('session_id, prompt_text')
        .in('session_id', paginatedSessionIds)
        .order('created_at', { ascending: true });
      for (const t of turns ?? []) {
        if (t.prompt_text && !sessionFirstPrompts[t.session_id]) {
          sessionFirstPrompts[t.session_id] = t.prompt_text;
        }
      }
    }

    // All-time cost (for profile)
    let allTimeCostQ = supabase.from('ai_sessions')
      .select('total_cost_usd')
      .eq('developer_id', devId);
    if (teamId) allTimeCostQ = allTimeCostQ.eq('team_id', teamId);
    const { data: allTimeSessions } = await allTimeCostQ;
    const allTimeCost = (allTimeSessions ?? []).reduce((s, r) => s + (r.total_cost_usd ?? 0), 0);

    // AI sessions this week (for stats)
    let weekQ = supabase.from('ai_sessions')
      .select('id, total_cost_usd, avg_prompt_score, total_turns, total_input_tokens, total_output_tokens')
      .eq('developer_id', devId)
      .gte('started_at', weekStartStr);
    if (teamId) weekQ = weekQ.eq('team_id', teamId);
    const { data: weekSessions } = await weekQ;

    // AI sessions last 30 days for trends
    let monthQ = supabase.from('ai_sessions')
      .select('id, model, total_cost_usd, avg_prompt_score, total_input_tokens, total_output_tokens, total_turns, started_at')
      .eq('developer_id', devId)
      .gte('started_at', thirtyDaysAgo)
      .order('started_at', { ascending: false });
    if (teamId) monthQ = monthQ.eq('team_id', teamId);
    const { data: monthSessions } = await monthQ;

    // Code changes this week
    let weekCodeQ = supabase.from('code_changes')
      .select('id, type, title, body, repo, files_changed, additions, deletions, branch, created_at')
      .eq('developer_id', devId)
      .gte('created_at', weekStartStr)
      .order('created_at', { ascending: false });
    if (teamId) weekCodeQ = weekCodeQ.eq('team_id', teamId);
    const { data: weekCode } = await weekCodeQ;

    // Code changes last 30 days
    let monthCodeQ = supabase.from('code_changes')
      .select('type, created_at')
      .eq('developer_id', devId)
      .gte('created_at', thirtyDaysAgo);
    if (teamId) monthCodeQ = monthCodeQ.eq('team_id', teamId);
    const { data: monthCode } = await monthCodeQ;

    // Tasks
    let tasksQ = supabase.from('tasks')
      .select('id, title, status, source, created_at')
      .eq('assignee_id', devId)
      .order('created_at', { ascending: false });
    if (teamId) tasksQ = tasksQ.eq('team_id', teamId);
    const { data: devTasks } = await tasksQ;

    // Anti-patterns from ai_turns
    const sessionIds = (weekSessions ?? []).map(s => s.id);
    let antiPatterns: { pattern: string; count: number }[] = [];
    if (sessionIds.length > 0) {
      const { data: turnData } = await supabase
        .from('ai_turns')
        .select('anti_patterns')
        .in('session_id', sessionIds)
        .not('anti_patterns', 'is', null);

      const patternCounts: Record<string, number> = {};
      for (const row of turnData ?? []) {
        const patterns = row.anti_patterns;
        if (!Array.isArray(patterns)) continue;
        for (const p of patterns) {
          const pid = typeof p === 'string' ? p : (p as Record<string, unknown>)?.id;
          if (typeof pid === 'string') {
            patternCounts[pid] = (patternCounts[pid] ?? 0) + 1;
          }
        }
      }
      antiPatterns = Object.entries(patternCounts)
        .map(([pattern, count]) => ({ pattern, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    }

    // Model usage breakdown
    const modelMap: Record<string, { count: number; cost: number }> = {};
    for (const s of monthSessions ?? []) {
      const m = s.model ?? 'unknown';
      if (!modelMap[m]) modelMap[m] = { count: 0, cost: 0 };
      modelMap[m].count++;
      modelMap[m].cost += s.total_cost_usd ?? 0;
    }
    const modelUsage = Object.entries(modelMap)
      .map(([model, { count, cost }]) => ({ model, count, cost }))
      .sort((a, b) => b.count - a.count);

    // Compute stats
    const totalAiCost = (weekSessions ?? []).reduce((s, r) => s + (r.total_cost_usd ?? 0), 0);
    const scores = (weekSessions ?? []).filter(s => s.avg_prompt_score != null).map(s => s.avg_prompt_score!);
    const avgPromptScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

    const commitsWeek = (weekCode ?? []).filter(c => c.type === 'commit').length;
    const prsWeek = (weekCode ?? []).filter(c => c.type === 'pr_opened' || c.type === 'pr_merged').length;
    const reviewsWeek = (weekCode ?? []).filter(c => c.type === 'review').length;

    const tasksCompleted = (devTasks ?? []).filter(t => t.status === 'completed').length;
    const tasksAssigned = (devTasks ?? []).length;

    // Commits per day (last 30 days)
    const commitsByDay: Record<string, number> = {};
    for (const c of monthCode ?? []) {
      if (c.type === 'commit') {
        const d = (c.created_at as string).slice(0, 10);
        commitsByDay[d] = (commitsByDay[d] ?? 0) + 1;
      }
    }
    const commitsPerDay = Object.entries(commitsByDay)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Score trend (last 30 days)
    const scoreByDate: Record<string, { sum: number; count: number }> = {};
    for (const s of monthSessions ?? []) {
      if (s.avg_prompt_score != null) {
        const d = (s.started_at as string).slice(0, 10);
        if (!scoreByDate[d]) scoreByDate[d] = { sum: 0, count: 0 };
        scoreByDate[d].sum += s.avg_prompt_score;
        scoreByDate[d].count++;
      }
    }
    const scoreTrend = Object.entries(scoreByDate)
      .map(([date, { sum, count }]) => ({ date, score: Math.round(sum / count) }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Generate insights
    const insights: string[] = [];

    // Model cost insight
    const topModel = modelUsage[0];
    const altModel = modelUsage.find(m => m.model !== topModel?.model);
    if (topModel && altModel && topModel.cost > altModel.cost * 2) {
      const potentialSavings = Math.round((topModel.cost - altModel.cost) * 100) / 100;
      insights.push(
        `Uses ${topModel.model} for ${Math.round((topModel.count / (monthSessions ?? []).length) * 100)}% of queries — switching to ${altModel.model} could save ~$${potentialSavings.toFixed(2)}/week`
      );
    }

    // Score trend insight
    if (scoreTrend.length >= 7) {
      const firstWeek = scoreTrend.slice(0, Math.ceil(scoreTrend.length / 2));
      const secondWeek = scoreTrend.slice(Math.ceil(scoreTrend.length / 2));
      const avgFirst = firstWeek.reduce((s, r) => s + r.score, 0) / firstWeek.length;
      const avgSecond = secondWeek.reduce((s, r) => s + r.score, 0) / secondWeek.length;
      if (avgSecond > avgFirst + 5) {
        insights.push(`Prompt score improved from ${Math.round(avgFirst)} to ${Math.round(avgSecond)} this month`);
      } else if (avgFirst > avgSecond + 5) {
        insights.push(`Prompt score declined from ${Math.round(avgFirst)} to ${Math.round(avgSecond)} — may need coaching`);
      }
    }

    // Anti-pattern insight
    const retryPattern = antiPatterns.find(p => p.pattern.includes('retry'));
    if (retryPattern && retryPattern.count >= 3) {
      insights.push(`Retries prompts ${retryPattern.count}x/week — prompt coaching would improve efficiency`);
    }

    // Task alignment insight
    if (tasksAssigned > 0 && tasksCompleted < tasksAssigned * 0.5) {
      const unplanned = commitsWeek - tasksCompleted;
      if (unplanned > 3) {
        insights.push(`${unplanned} unplanned commits — may need task re-alignment`);
      }
    }

    // Inactive insight
    if ((weekSessions ?? []).length === 0) {
      insights.push(`Hasn't used AI tools this week — may not have evaluateai installed`);
    }

    // ── Coaching tips: personalized advice based on top anti-patterns ──
    const ANTI_PATTERN_TIPS: Record<string, { label: string; tip: string; severity: 'high' | 'medium' | 'low' }> = {
      vague_verb: { label: 'Vague commands', tip: 'Add which file, what specific behavior, and what error you see. Example: "Fix the login redirect in src/auth/callback.ts — getting 401 after token refresh" instead of "fix login".', severity: 'high' },
      paraphrased_error: { label: 'Paraphrased errors', tip: 'Paste the exact error message in backticks instead of describing it. The AI needs the precise error text to diagnose accurately.', severity: 'high' },
      too_short: { label: 'Too short prompts', tip: 'Add context: which file, what you expect, and what went wrong. Even 2-3 extra sentences dramatically improve AI response quality.', severity: 'high' },
      retry_detected: { label: 'Repeated prompts', tip: 'When retrying, explain what was wrong with the previous answer. "Try again" wastes tokens — "The previous fix broke X because Y, instead do Z" gets better results.', severity: 'high' },
      no_file_ref: { label: 'Missing file references', tip: 'Always specify the file path and function name. The AI can\'t find code in large projects without explicit paths like src/components/Auth.tsx:handleLogin.', severity: 'medium' },
      multi_question: { label: 'Multiple questions at once', tip: 'Ask one question per prompt. Multiple questions cause the AI to give shallow answers to all instead of a thorough answer to one.', severity: 'medium' },
      overlong_prompt: { label: 'Overly long prompts', tip: 'Split into a clear task description + separate context. Put large code blocks in files and reference them by path instead of pasting inline.', severity: 'medium' },
      no_expected_output: { label: 'No expected outcome', tip: 'Describe what success looks like: "should return a JSON array of users" or "the button should redirect to /dashboard after login".', severity: 'medium' },
      unanchored_ref: { label: 'Ambiguous references', tip: 'Re-state what "it" or "the issue" refers to — the AI loses context across turns. Say "the auth middleware" instead of "it".', severity: 'low' },
      filler_words: { label: 'Filler words', tip: 'Words like "please", "could you kindly" cost tokens without improving results. This is minor but adds up over hundreds of prompts.', severity: 'low' },
    };

    const coachingTips = antiPatterns.slice(0, 5).map(ap => {
      const tipInfo = ANTI_PATTERN_TIPS[ap.pattern] ?? {
        label: ap.pattern.replace(/_/g, ' '),
        tip: 'Review this pattern and consider how to avoid it.',
        severity: 'medium' as const,
      };
      return {
        pattern: ap.pattern,
        count: ap.count,
        label: tipInfo.label,
        tip: tipInfo.tip,
        severity: tipInfo.severity,
      };
    });

    // Cost trend (daily cost over 30 days)
    const costByDay: Record<string, number> = {};
    for (const s of monthSessions ?? []) {
      const d = (s.started_at as string).slice(0, 10);
      costByDay[d] = (costByDay[d] ?? 0) + (s.total_cost_usd ?? 0);
    }
    const costTrend = Object.entries(costByDay)
      .map(([date, cost]) => ({ date, cost: Math.round(cost * 1000) / 1000 }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Token stats (weekly + monthly totals)
    const weekTokens = (weekSessions ?? []).reduce(
      (acc, s) => ({
        input: acc.input + (s.total_input_tokens ?? 0),
        output: acc.output + (s.total_output_tokens ?? 0),
        turns: acc.turns + (s.total_turns ?? 0),
      }),
      { input: 0, output: 0, turns: 0 },
    );
    const monthTokens = (monthSessions ?? []).reduce(
      (acc, s) => ({
        input: acc.input + (s.total_input_tokens ?? 0),
        output: acc.output + (s.total_output_tokens ?? 0),
        turns: acc.turns + (s.total_turns ?? 0),
      }),
      { input: 0, output: 0, turns: 0 },
    );

    // Sessions per day of week (usage pattern)
    const dayOfWeekUsage: number[] = [0, 0, 0, 0, 0, 0, 0]; // Sun-Sat
    for (const s of monthSessions ?? []) {
      const d = new Date(s.started_at as string).getDay();
      dayOfWeekUsage[d]++;
    }
    const usageByDayOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(
      (day, i) => ({ day, sessions: dayOfWeekUsage[i] }),
    );

    return NextResponse.json({
      developer: {
        id: member.id,
        userId: devId,
        name: member.name,
        email: member.email,
        role: member.role,
        githubUsername: member.github_username,
        evaluateaiInstalled: member.evaluateai_installed ?? false,
      },
      stats: {
        totalAiCost,
        allTimeCost,
        totalSessions: totalSessionCount ?? 0,
        avgPromptScore,
        commits: commitsWeek,
        prs: prsWeek,
        reviews: reviewsWeek,
        tasksCompleted,
        tasksAssigned,
        sessionsThisWeek: (weekSessions ?? []).length,
      },
      sessions: (paginatedSessions ?? []).map(s => ({
        id: s.id,
        model: s.model,
        cost: s.total_cost_usd,
        score: s.avg_prompt_score,
        turns: s.total_turns,
        inputTokens: s.total_input_tokens,
        outputTokens: s.total_output_tokens,
        startedAt: s.started_at,
        endedAt: s.ended_at ?? null,
        durationMin: s.ended_at && s.started_at
          ? Math.round((new Date(s.ended_at as string).getTime() - new Date(s.started_at as string).getTime()) / 60_000)
          : null,
        firstPrompt: sessionFirstPrompts[s.id] ?? null,
        workSummary: s.work_summary ?? null,
        workTags: s.work_tags ?? [],
        workCategory: s.work_category ?? null,
      })),
      sessionTotal: totalSessionCount ?? 0,
      codeChanges: (weekCode ?? []).map(c => ({
        id: c.id,
        type: c.type,
        title: c.title,
        description: c.body,
        repo: c.repo,
        filesChanged: c.files_changed,
        additions: c.additions,
        deletions: c.deletions,
        branch: c.branch,
        createdAt: c.created_at,
      })),
      tasks: (devTasks ?? []).map(t => ({
        id: t.id,
        title: t.title,
        status: t.status,
        source: t.source,
        createdAt: t.created_at,
      })),
      modelUsage,
      antiPatterns,
      commitsPerDay,
      scoreTrend,
      costTrend,
      tokenStats: { week: weekTokens, month: monthTokens },
      usageByDayOfWeek,
      insights,
      coachingTips,
    });
  } catch (err) {
    console.error('Developer detail API error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
