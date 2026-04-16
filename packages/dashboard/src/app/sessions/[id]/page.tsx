'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Lightbulb,
  Sparkles,
  Clock,
  Coins,
  Layers,
  Hash,
  Wrench,
  ArrowRight,
  Info,
  FileText,
  Tag,
  RefreshCw,
} from 'lucide-react';

// --------------- Types ---------------

interface TurnData {
  id: string;
  turnNumber: number;
  promptText: string | null;
  promptTokensEst: number | null;
  heuristicScore: number | null;
  llmScore: number | null;
  antiPatterns: string | null;
  suggestionText: string | null;
  suggestionAccepted: boolean | null;
  toolCalls: string | null;
  responseTokensEst: number | null;
  latencyMs: number | null;
  contextUsedPct: number | null;
  costUsd: number | null;
  createdAt: string;
}

interface SessionAnalysis {
  efficiencyScore: number;
  summary: string;
  topTip: string;
  rewrittenFirstPrompt: string;
  modelRecommendations?: Array<{
    turn: number;
    used: string;
    recommended: string;
    savingsUsd: number;
  }>;
}

interface SessionDetail {
  id: string;
  model: string | null;
  intent: string | null;
  startedAt: string;
  endedAt: string | null;
  totalTurns: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  totalToolCalls: number;
  efficiencyScore: number | null;
  tokenWasteRatio: number | null;
  contextPeakPct: number | null;
  analysis: string | null;
  turns: TurnData[];
  developerId: string | null;
  developerName: string | null;
  workSummary: string | null;
  workTags: string[];
  workCategory: string | null;
  matchedTaskId: string | null;
}

// --------------- Design tokens ---------------

const INTENT_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  research: { bg: 'bg-purple-900/30', text: 'text-purple-400', dot: 'bg-purple-400' },
  debug:    { bg: 'bg-red-900/30',    text: 'text-red-400',    dot: 'bg-red-400' },
  feature:  { bg: 'bg-green-900/30',  text: 'text-green-400',  dot: 'bg-green-400' },
  refactor: { bg: 'bg-blue-900/30',   text: 'text-blue-400',   dot: 'bg-blue-400' },
  review:   { bg: 'bg-yellow-900/30', text: 'text-yellow-400', dot: 'bg-yellow-400' },
  generate: { bg: 'bg-cyan-900/30',   text: 'text-cyan-400',   dot: 'bg-cyan-400' },
  config:   { bg: 'bg-orange-900/30', text: 'text-orange-400', dot: 'bg-orange-400' },
};

// --------------- Helpers ---------------

function formatCost(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return '--';
  const ms = Math.max(0, new Date(end).getTime() - new Date(start).getTime());
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

function scoreColor(score: number | null): string {
  if (score === null) return 'text-text-muted';
  if (score >= 80) return 'text-emerald-400';
  if (score >= 60) return 'text-blue-400';
  if (score >= 40) return 'text-yellow-400';
  return 'text-red-400';
}

function scoreRingColor(score: number | null): string {
  if (score === null) return 'var(--text-muted)';
  if (score >= 80) return '#22c55e';
  if (score >= 60) return '#3b82f6';
  if (score >= 40) return '#eab308';
  return '#ef4444';
}

function scoreBg(score: number | null): string {
  if (score === null) return 'bg-border-primary text-text-muted';
  if (score >= 80) return 'bg-emerald-900/40 text-emerald-400';
  if (score >= 60) return 'bg-blue-900/40 text-blue-400';
  if (score >= 40) return 'bg-yellow-900/40 text-yellow-400';
  return 'bg-red-900/40 text-red-400';
}

function scoreLabel(score: number | null): string {
  if (score === null) return '--';
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Needs Work';
  return 'Poor';
}

function scoreBorderColor(score: number | null): string {
  if (score === null) return 'border-l-border-hover';
  if (score >= 80) return 'border-l-emerald-400';
  if (score >= 60) return 'border-l-blue-400';
  if (score >= 40) return 'border-l-yellow-400';
  return 'border-l-red-400';
}

function parseJsonSafe<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

function guessIntent(session: SessionDetail): string {
  if (session.intent) return session.intent.toLowerCase();
  const text = (session.turns?.[0]?.promptText ?? '').toLowerCase();
  if (/fix|bug|debug|error|issue/.test(text)) return 'debug';
  if (/add|create|build|implement|feature/.test(text)) return 'feature';
  if (/refactor|clean|rename|reorganize/.test(text)) return 'refactor';
  if (/test|generate|write/.test(text)) return 'generate';
  if (/review|check|audit/.test(text)) return 'review';
  if (/config|setup|install/.test(text)) return 'config';
  return 'research';
}

function sessionTitle(session: SessionDetail): string {
  const prompt = session.turns?.[0]?.promptText;
  if (prompt) {
    const clean = prompt.replace(/<[^>]+>/g, '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    if (clean.length > 0) {
      return clean.length > 100 ? clean.slice(0, 100) + '...' : clean;
    }
  }
  return `Session ${session.id.slice(0, 8)}`;
}

// --------------- Anti-pattern tips ---------------

const ANTI_PATTERN_TIPS: Record<string, { label: string; tip: string }> = {
  vague_verb: { label: 'Vague verb', tip: 'Add specific file paths, function names, and error messages' },
  paraphrased_error: { label: 'Paraphrased error', tip: 'Paste the exact error message in backticks' },
  too_short: { label: 'Too short', tip: 'Add context: file path, function name, expected behavior' },
  retry_detected: { label: 'Retry detected', tip: 'Explain what was wrong with the prior answer instead of repeating' },
  no_file_ref: { label: 'No file reference', tip: 'Include the file path and function name' },
  multi_question: { label: 'Multiple questions', tip: 'Split into one question per turn for better results' },
  overlong_prompt: { label: 'Overlong prompt', tip: 'Split into task description + separate context' },
  no_expected_output: { label: 'No expected output', tip: 'Describe what success looks like' },
  unanchored_ref: { label: 'Unanchored reference', tip: 'Re-state what "it" or "that" refers to' },
  filler_words: { label: 'Filler words', tip: 'Remove "please", "could you" -- saves tokens with no quality loss' },
};

// --------------- Score Ring SVG ---------------

function ScoreRing({ score, size = 120 }: { score: number | null; size?: number }) {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = score !== null ? Math.min(100, Math.max(0, score)) / 100 : 0;
  const strokeDashoffset = circumference * (1 - pct);
  const color = scoreRingColor(score);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border-primary)"
          strokeWidth={6}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-1000 ease-out"
          style={{ filter: `drop-shadow(0 0 6px ${color}40)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-3xl font-bold ${scoreColor(score)}`}>
          {score !== null ? Math.round(score) : '--'}
        </span>
        <span className="text-[10px] text-text-muted font-medium tracking-wider uppercase mt-0.5">
          {scoreLabel(score)}
        </span>
      </div>
    </div>
  );
}

// --------------- Skeleton ---------------

function SkeletonBlock({ className }: { className?: string }) {
  return <div className={`bg-bg-elevated rounded animate-pulse ${className ?? ''}`} />;
}

function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-bg-primary p-6 md:p-8">
      <div className="max-w-7xl mx-auto">
        <SkeletonBlock className="h-4 w-20 mb-6" />
        <SkeletonBlock className="h-7 w-64 mb-3" />
        <div className="flex gap-3 mb-8">
          <SkeletonBlock className="h-6 w-20 rounded-full" />
          <SkeletonBlock className="h-6 w-16 rounded-full" />
          <SkeletonBlock className="h-6 w-14 rounded-full" />
        </div>
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1 space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonBlock key={i} className="h-32 w-full rounded-xl" />
            ))}
          </div>
          <div className="lg:w-[40%] space-y-4">
            <SkeletonBlock className="h-48 w-full rounded-xl" />
            <SkeletonBlock className="h-32 w-full rounded-xl" />
            <SkeletonBlock className="h-40 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}

// --------------- HeuristicAnalysis ---------------

function HeuristicAnalysis({ turns }: { turns: TurnData[]; session: SessionDetail }) {
  const patternCounts: Record<string, number> = {};
  turns.forEach(t => {
    const ap = parseJsonSafe<string[]>(typeof t.antiPatterns === 'string' ? t.antiPatterns : JSON.stringify(t.antiPatterns), []);
    if (Array.isArray(ap)) {
      for (const p of ap) {
        const id = typeof p === 'string' ? p : (p as { id?: string })?.id;
        if (id) patternCounts[id] = (patternCounts[id] ?? 0) + 1;
      }
    }
  });

  const sortedPatterns = Object.entries(patternCounts).sort((a, b) => b[1] - a[1]);
  const scores = turns.map(t => t.heuristicScore ?? t.llmScore).filter((s): s is number => s !== null);
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const lowScoreTurns = turns.filter(t => (t.heuristicScore ?? 100) < 50);
  const highScoreTurns = turns.filter(t => (t.heuristicScore ?? 0) >= 70);

  let summary = '';
  if (turns.length === 0) {
    summary = 'No turns recorded in this session.';
  } else if (avgScore !== null && avgScore >= 70) {
    summary = `Good session with an average score of ${avgScore}/100. ${highScoreTurns.length} of ${turns.length} prompts scored well.`;
  } else if (avgScore !== null && avgScore >= 40) {
    summary = `Mixed session with an average score of ${avgScore}/100. ${lowScoreTurns.length} of ${turns.length} prompts need improvement.`;
  } else {
    summary = `This session scored ${avgScore ?? 0}/100 on average. Most prompts lacked specificity or context.`;
  }

  const topPattern = sortedPatterns[0];
  const topTip = topPattern
    ? ANTI_PATTERN_TIPS[topPattern[0]]?.tip ?? 'Add more context to your prompts for better results.'
    : highScoreTurns.length === turns.length
      ? 'Great prompting! Keep including file paths and error messages.'
      : 'Try including file paths, error messages, and expected behavior in your prompts.';

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div>
        <p className="text-xs text-text-muted uppercase tracking-wider font-medium mb-2">Summary</p>
        <p className="text-sm text-text-primary leading-relaxed">{summary}</p>
      </div>

      {/* Top Issues */}
      {sortedPatterns.length > 0 && (
        <div>
          <p className="text-xs text-text-muted uppercase tracking-wider font-medium mb-3">Issues Found</p>
          <div className="space-y-2">
            {sortedPatterns.slice(0, 5).map(([id, count]) => {
              const info = ANTI_PATTERN_TIPS[id];
              return (
                <div key={id} className="bg-bg-card border border-border-primary rounded-lg p-3.5 flex items-start justify-between gap-3 hover:border-border-hover transition-colors">
                  <div>
                    <span className="text-sm font-medium text-text-primary">{info?.label ?? id}</span>
                    <p className="text-xs text-text-muted mt-1 leading-relaxed">{info?.tip ?? ''}</p>
                  </div>
                  <span className="text-[10px] font-medium bg-bg-elevated text-text-muted px-2 py-0.5 rounded-full whitespace-nowrap border border-border-primary">
                    {count}x
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top Tip */}
      <div>
        <p className="text-xs text-text-muted uppercase tracking-wider font-medium mb-2">Top Tip</p>
        <div className="bg-yellow-900/10 border border-yellow-800/30 rounded-lg p-4 flex items-start gap-3">
          <Lightbulb className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
          <p className="text-sm text-yellow-300/90 leading-relaxed">{topTip}</p>
        </div>
      </div>

      {/* Score breakdown */}
      <div>
        <p className="text-xs text-text-muted uppercase tracking-wider font-medium mb-3">Turn Scores</p>
        <div className="flex gap-2 flex-wrap">
          {turns.map((t) => {
            const s = t.heuristicScore ?? t.llmScore;
            return (
              <span key={t.id} className={`text-xs font-medium px-2.5 py-1 rounded-lg ${scoreBg(s)}`}>
                T{t.turnNumber}: {s !== null ? `${Math.round(s)}` : '?'}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// --------------- TurnCard ---------------

function TurnCard({ turn, sessionId }: { turn: TurnData; sessionId: string }) {
  const [expanded, setExpanded] = useState(false);
  const router = useRouter();
  const score = turn.llmScore ?? turn.heuristicScore;
  const antiPatterns = parseJsonSafe<Array<{ id: string; severity: string; hint: string }>>(
    turn.antiPatterns,
    [],
  );
  const toolCalls = parseJsonSafe<string[]>(turn.toolCalls, []);
  const promptLong = (turn.promptText?.length ?? 0) > 200;

  return (
    <div
      className={`bg-bg-card border border-border-primary border-l-[3px] ${scoreBorderColor(score)} rounded-lg p-4 cursor-pointer hover:bg-bg-elevated hover:border-border-hover hover:shadow-lg hover:shadow-black/20 transition-all duration-200 group`}
      onClick={() => router.push(`/sessions/${sessionId}/turns/${turn.turnNumber}`)}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-semibold text-text-primary">Turn {turn.turnNumber}</span>
          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${scoreBg(score)}`}>
            {score !== null ? `${Math.round(score)}/100` : 'N/A'}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-text-muted">
          {turn.responseTokensEst !== null && (
            <span className="flex items-center gap-1">
              <Layers className="w-3 h-3" />
              {formatTokens(turn.responseTokensEst)}
            </span>
          )}
          {turn.latencyMs !== null && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatMs(turn.latencyMs)}
            </span>
          )}
        </div>
      </div>

      {/* Prompt */}
      {turn.promptText && (
        <div className="mb-3">
          <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
            {expanded || !promptLong ? turn.promptText : turn.promptText.slice(0, 200) + '...'}
          </p>
          {promptLong && (
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
              className="mt-1.5 text-xs text-[#8b5cf6] hover:text-[#a78bfa] inline-flex items-center gap-1 transition-colors"
            >
              {expanded ? (
                <>
                  <ChevronUp className="w-3 h-3" /> Show less
                </>
              ) : (
                <>
                  <ChevronDown className="w-3 h-3" /> Show more
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Anti-patterns */}
      {antiPatterns.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {antiPatterns.map((ap, i) => (
            <span
              key={i}
              className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                ap.severity === 'high'
                  ? 'bg-red-900/20 text-red-400 border-red-800/40'
                  : ap.severity === 'medium'
                    ? 'bg-yellow-900/20 text-yellow-400 border-yellow-800/40'
                    : 'bg-bg-elevated text-text-muted border-border-primary'
              }`}
              title={ap.hint}
            >
              {ap.id}
            </span>
          ))}
        </div>
      )}

      {/* Suggestion */}
      {turn.suggestionText && (
        <div className="bg-bg-primary border border-border-primary rounded-lg p-3 mb-3">
          <div className="flex items-center gap-2 mb-1.5">
            <Lightbulb className="w-3.5 h-3.5 text-yellow-400" />
            <span className="text-[11px] font-medium text-text-secondary">Suggestion</span>
            {turn.suggestionAccepted !== null && (
              <span
                className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                  turn.suggestionAccepted
                    ? 'bg-emerald-900/30 text-emerald-400'
                    : 'bg-red-900/30 text-red-400'
                }`}
              >
                {turn.suggestionAccepted ? 'Accepted' : 'Rejected'}
              </span>
            )}
          </div>
          <p className="text-xs text-text-muted leading-relaxed">{turn.suggestionText}</p>
        </div>
      )}

      {/* Tool calls */}
      {toolCalls.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {toolCalls.map((tc, i) => (
            <span key={i} className="inline-flex items-center gap-1 text-[10px] font-medium bg-bg-elevated text-text-muted px-2 py-0.5 rounded border border-border-primary">
              <Wrench className="w-2.5 h-2.5" />
              {tc}
            </span>
          ))}
        </div>
      )}

      {/* View details */}
      <div className="flex justify-end pt-3 border-t border-bg-elevated">
        <span className="text-xs text-[#8b5cf6] group-hover:text-[#a78bfa] transition-colors inline-flex items-center gap-1">
          View details <ArrowRight className="w-3 h-3" />
        </span>
      </div>
    </div>
  );
}

// --------------- Main ---------------

export default function SessionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const fetchSession = () => {
    return fetch(`/api/sessions/${sessionId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        const merged: SessionDetail = {
          ...data.session,
          analysis: data.analysis ? JSON.stringify(data.analysis) : null,
          turns: data.turns ?? [],
        };
        setSession(merged);
      });
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/sync`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setSyncResult(data.error || 'Sync failed');
        return;
      }
      const s = data.synced;
      setSyncResult(
        `Synced: ${s.userTurns} turns, ${s.turnsUpdated} turns updated, ${formatTokens(s.totalOutputTokens)} output tokens${s.sessionClosed ? ', session closed' : ''}${s.summaryGenerated ? ', work summary generated' : ''}`
      );
      // Reload session data to show updated values
      await fetchSession();
    } catch (e) {
      setSyncResult(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchSession()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (error || !session) {
    return (
      <div className="min-h-screen bg-bg-primary p-6 md:p-8">
        <div className="max-w-7xl mx-auto">
          <button
            onClick={() => router.push('/sessions')}
            className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary mb-6 transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" /> Sessions
          </button>
          <div className="bg-red-900/20 border border-red-800/50 rounded-xl p-5 text-red-300 flex items-start gap-3">
            <div className="w-2 h-2 rounded-full bg-red-400 mt-2 shrink-0" />
            <div>
              <p className="font-medium text-red-300 mb-1">{error ? 'Failed to load session' : 'Session not found'}</p>
              <p className="text-sm text-red-400/80">{error ?? 'The session you are looking for does not exist.'}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const analysis = parseJsonSafe<SessionAnalysis | null>(session.analysis, null);
  const turns = session.turns ?? [];
  const intent = guessIntent(session);
  const intentStyle = INTENT_STYLES[intent] ?? INTENT_STYLES.research;

  // Compute fallback efficiency score from avg turn prompt scores if null
  const turnScores = turns.map(t => t.heuristicScore ?? t.llmScore).filter((s): s is number => s !== null);
  const computedEfficiency = session.efficiencyScore
    ?? (analysis?.efficiencyScore ?? null)
    ?? (turnScores.length > 0 ? Math.round(turnScores.reduce((a, b) => a + b, 0) / turnScores.length) : null);
  const efficiencyIsEstimated = session.efficiencyScore == null && computedEfficiency != null;

  // Use actual per-turn costs when available for total cost
  const hasActualCosts = turns.some(t => t.costUsd != null && t.costUsd > 0);
  const actualTotalCost = hasActualCosts
    ? turns.reduce((sum, t) => sum + (t.costUsd ?? 0), 0)
    : session.totalCostUsd;

  return (
    <div className="min-h-screen bg-bg-primary p-6 md:p-8 animate-section">
      <div className="max-w-7xl mx-auto">

        {/* Back button — go to developer detail page */}
        <button
          onClick={() => router.push(session.developerId ? `/dashboard/developers/${session.developerId}` : '/dashboard/developers')}
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary mb-6 transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          <span className="group-hover:underline underline-offset-4">
            {session.developerName ? `${session.developerName}'s Sessions` : 'Developers'}
          </span>
        </button>

        {/* Header section */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-text-primary mb-3">
            {sessionTitle(session)}
          </h1>
          <div className="flex flex-wrap items-center gap-3">
            {/* Intent badge */}
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${intentStyle.bg} ${intentStyle.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${intentStyle.dot}`} />
              {intent}
            </span>
            {/* Model */}
            <span className="text-xs text-text-muted bg-bg-elevated border border-border-primary px-2.5 py-1 rounded-full" title="AI model used for this session">
              {session.model ?? 'Unknown'}
            </span>
            {/* Turns */}
            <span className="text-xs text-text-muted flex items-center gap-1" title="Number of prompt-response exchanges">
              <Hash className="w-3 h-3" /> {session.totalTurns} turns
            </span>
            {/* Cost */}
            <span className="text-xs text-text-muted flex items-center gap-1" title="Total API cost for all turns in this session">
              <Coins className="w-3 h-3" /> {formatCost(actualTotalCost)}
            </span>
            {/* Duration */}
            <span className="text-xs text-text-muted flex items-center gap-1" title="Total session duration from first to last turn">
              <Clock className="w-3 h-3" /> {formatDuration(session.startedAt, session.endedAt)}
            </span>
            {/* Sync Now */}
            <button
              onClick={handleSync}
              disabled={syncing}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full border border-border-primary bg-bg-card hover:bg-bg-elevated disabled:opacity-50 text-text-secondary transition-colors"
              title="Re-sync session data from local transcript file"
            >
              <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync Now'}
            </button>
          </div>
          {syncResult && (
            <p className={`text-xs mt-2 ${syncResult.startsWith('Synced') ? 'text-emerald-400' : 'text-red-400'}`}>
              {syncResult}
            </p>
          )}
        </div>

        {/* Two-column layout (60/40) */}
        <div className="flex flex-col lg:flex-row gap-6 mb-8">

          {/* LEFT: Turn Timeline */}
          <div className="flex-1 lg:w-[60%] min-w-0">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-lg font-medium text-text-primary">Turn Timeline</h2>
              <span className="text-xs font-medium text-text-muted bg-bg-elevated border border-border-primary px-2 py-0.5 rounded-full">
                {turns.length}
              </span>
            </div>
            {turns.length === 0 ? (
              <div className="bg-bg-card border border-border-primary rounded-xl p-12 text-center">
                <Info className="w-8 h-8 text-text-muted mx-auto mb-3" />
                <p className="text-sm text-text-muted">No turns recorded.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {turns.map((turn, idx) => (
                  <div
                    key={turn.id}
                    className="transition-all duration-300"
                    style={{ animationDelay: `${idx * 50}ms` }}
                  >
                    <TurnCard turn={turn} sessionId={sessionId} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* RIGHT: Session Metrics */}
          <div className="lg:w-[40%] space-y-4">
            {/* Work Summary Card */}
            {session.workSummary && (
              <div className="bg-bg-card border border-border-primary rounded-xl p-6">
                <h2 className="text-lg font-medium text-text-primary mb-4 flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-purple-900/30 flex items-center justify-center">
                    <FileText className="w-4 h-4 text-purple-400" />
                  </div>
                  Work Summary
                </h2>
                <p className="text-sm text-text-primary leading-relaxed">{session.workSummary}</p>
                {session.workTags && session.workTags.length > 0 && (
                  <div className="flex items-center gap-2 mt-4 flex-wrap">
                    <Tag className="w-3 h-3 text-text-muted" />
                    {session.workTags.map((tag) => (
                      <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-purple-900/20 text-purple-400 border border-purple-800/30">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                {session.workCategory && (
                  <div className="mt-3">
                    <span className={`text-xs px-2 py-0.5 rounded ${INTENT_STYLES[session.workCategory]?.bg ?? 'bg-bg-elevated'} ${INTENT_STYLES[session.workCategory]?.text ?? 'text-text-secondary'}`}>
                      {session.workCategory}
                    </span>
                  </div>
                )}
              </div>
            )}

            <h2 className="text-lg font-medium text-text-primary mb-2">Session Metrics</h2>

            {/* Efficiency score ring */}
            <div className="bg-bg-card border border-border-primary rounded-xl p-6 flex flex-col items-center" title="Efficiency Score measures overall session quality. Based on prompt scores, retries, token usage, and workflow efficiency. Score 0-100 where higher is better.">
              <p className="text-xs text-text-muted uppercase tracking-wider font-medium mb-4">
                Efficiency Score
                {efficiencyIsEstimated && (
                  <span className="ml-1.5 text-[10px] normal-case tracking-normal text-yellow-400" title="Estimated from average turn scores. LLM analysis has not run for this session.">
                    (estimated)
                  </span>
                )}
              </p>
              <ScoreRing score={computedEfficiency} size={140} />
            </div>

            {/* Stat grid */}
            <div className="bg-bg-card border border-border-primary rounded-xl p-5 grid grid-cols-3 gap-4">
              <div className="space-y-1" title="Total API cost for all turns in this session">
                <p className="text-[10px] text-text-muted uppercase tracking-wider font-medium flex items-center gap-1.5">
                  <Coins className="w-3 h-3" /> Total Cost
                </p>
                <p className="text-xl font-semibold text-text-primary font-mono">{formatCost(actualTotalCost)}</p>
              </div>
              <div className="space-y-1" title="Total time from session start to end">
                <p className="text-[10px] text-text-muted uppercase tracking-wider font-medium flex items-center gap-1.5">
                  <Clock className="w-3 h-3" /> Duration
                </p>
                <p className="text-xl font-semibold text-text-primary">{formatDuration(session.startedAt, session.endedAt)}</p>
              </div>
              <div className="space-y-1" title="Number of prompt-response exchanges in this session">
                <p className="text-[10px] text-text-muted uppercase tracking-wider font-medium flex items-center gap-1.5">
                  <Hash className="w-3 h-3" /> Turns
                </p>
                <p className="text-xl font-semibold text-text-primary">{session.totalTurns}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom: Session Analysis */}
        <div className="bg-bg-card border border-border-primary rounded-xl p-6">
          <h2 className="text-lg font-medium text-text-primary mb-5 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-900/30 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-purple-400" />
            </div>
            Session Analysis
          </h2>
          {analysis ? (
            <div className="space-y-5">
              <div>
                <p className="text-xs text-text-muted uppercase tracking-wider font-medium mb-2">Summary</p>
                <p className="text-sm text-text-primary leading-relaxed">{analysis.summary}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted uppercase tracking-wider font-medium mb-2">Top Tip</p>
                <div className="bg-yellow-900/10 border border-yellow-800/30 rounded-lg p-4 flex items-start gap-3">
                  <Lightbulb className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-yellow-300/90 leading-relaxed">{analysis.topTip}</p>
                </div>
              </div>
              {analysis.rewrittenFirstPrompt && (
                <div>
                  <p className="text-xs text-text-muted uppercase tracking-wider font-medium mb-3">Prompt Replay: Before / After</p>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <div className="bg-red-950/10 border border-red-900/30 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 rounded-full bg-red-400" />
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-red-400">Original</span>
                      </div>
                      <p className="text-sm text-text-secondary leading-relaxed">
                        {turns.length > 0 && turns[0].promptText
                          ? turns[0].promptText.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 500)
                          : 'First prompt not available'}
                      </p>
                    </div>
                    <div className="bg-emerald-950/10 border border-emerald-900/30 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-400" />
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">Improved</span>
                      </div>
                      <p className="text-sm text-text-primary leading-relaxed">
                        {analysis.rewrittenFirstPrompt}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <HeuristicAnalysis turns={turns} session={session} />
          )}
        </div>
      </div>
    </div>
  );
}
