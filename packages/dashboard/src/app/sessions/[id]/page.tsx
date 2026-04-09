'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertTriangle,
  Lightbulb,
  Sparkles,
  Clock,
  Coins,
  Gauge,
  Layers,
  Hash,
  Wrench,
  FileCode,
  Zap,
  ArrowRight,
  ChevronRight,
  TrendingUp,
  Info,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

// --------------- Types ---------------

interface TurnData {
  id: string;
  turnNumber: number;
  promptText: string | null;
  heuristicScore: number | null;
  llmScore: number | null;
  antiPatterns: string | null;
  suggestionText: string | null;
  suggestionAccepted: boolean | null;
  toolCalls: string | null;
  responseTokensEst: number | null;
  latencyMs: number | null;
  contextUsedPct: number | null;
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

function formatCostPrecise(usd: number): string {
  return `$${usd.toFixed(4)}`;
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
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

function scoreColor(score: number | null): string {
  if (score === null) return 'text-[var(--text-muted)]';
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
  if (score === null) return 'bg-[var(--border-primary)] text-[var(--text-muted)]';
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
  if (score === null) return 'border-l-[var(--border-hover)]';
  if (score >= 80) return 'border-l-emerald-400';
  if (score >= 60) return 'border-l-blue-400';
  if (score >= 40) return 'border-l-yellow-400';
  return 'border-l-red-400';
}

function pctBarColor(pct: number): string {
  if (pct >= 80) return 'bg-red-500';
  if (pct >= 50) return 'bg-yellow-500';
  return 'bg-emerald-500';
}

function pctBarColorHex(pct: number): string {
  if (pct >= 80) return '#ef4444';
  if (pct >= 50) return '#eab308';
  return '#22c55e';
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
        <span className="text-[10px] text-[var(--text-muted)] font-medium tracking-wider uppercase mt-0.5">
          {scoreLabel(score)}
        </span>
      </div>
    </div>
  );
}

// --------------- Skeleton ---------------

function SkeletonBlock({ className }: { className?: string }) {
  return <div className={`bg-[var(--bg-elevated)] rounded animate-pulse ${className ?? ''}`} />;
}

function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] p-6 md:p-8">
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

function HeuristicAnalysis({ turns, session }: { turns: TurnData[]; session: SessionDetail }) {
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
        <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-medium mb-2">Summary</p>
        <p className="text-sm text-[var(--text-primary)] leading-relaxed">{summary}</p>
      </div>

      {/* Top Issues */}
      {sortedPatterns.length > 0 && (
        <div>
          <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-medium mb-3">Issues Found</p>
          <div className="space-y-2">
            {sortedPatterns.slice(0, 5).map(([id, count]) => {
              const info = ANTI_PATTERN_TIPS[id];
              return (
                <div key={id} className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-lg p-3.5 flex items-start justify-between gap-3 hover:border-[var(--border-hover)] transition-colors">
                  <div>
                    <span className="text-sm font-medium text-[var(--text-primary)]">{info?.label ?? id}</span>
                    <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">{info?.tip ?? ''}</p>
                  </div>
                  <span className="text-[10px] font-medium bg-[var(--bg-elevated)] text-[var(--text-muted)] px-2 py-0.5 rounded-full whitespace-nowrap border border-[var(--border-primary)]">
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
        <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-medium mb-2">Top Tip</p>
        <div className="bg-yellow-900/10 border border-yellow-800/30 rounded-lg p-4 flex items-start gap-3">
          <Lightbulb className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
          <p className="text-sm text-yellow-300/90 leading-relaxed">{topTip}</p>
        </div>
      </div>

      {/* Score breakdown */}
      <div>
        <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-medium mb-3">Turn Scores</p>
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
      className={`bg-[var(--bg-card)] border border-[var(--border-primary)] border-l-[3px] ${scoreBorderColor(score)} rounded-lg p-4 cursor-pointer hover:bg-[var(--bg-elevated)] hover:border-[var(--border-hover)] hover:shadow-lg hover:shadow-black/20 transition-all duration-200 group`}
      onClick={() => router.push(`/sessions/${sessionId}/turns/${turn.turnNumber}`)}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-semibold text-[var(--text-primary)]">Turn {turn.turnNumber}</span>
          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${scoreBg(score)}`}>
            {score !== null ? `${Math.round(score)}/100` : 'N/A'}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
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
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
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
                    : 'bg-[var(--bg-elevated)] text-[var(--text-muted)] border-[var(--border-primary)]'
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
        <div className="bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg p-3 mb-3">
          <div className="flex items-center gap-2 mb-1.5">
            <Lightbulb className="w-3.5 h-3.5 text-yellow-400" />
            <span className="text-[11px] font-medium text-[var(--text-secondary)]">Suggestion</span>
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
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">{turn.suggestionText}</p>
        </div>
      )}

      {/* Tool calls */}
      {toolCalls.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {toolCalls.map((tc, i) => (
            <span key={i} className="inline-flex items-center gap-1 text-[10px] font-medium bg-[var(--bg-elevated)] text-[var(--text-muted)] px-2 py-0.5 rounded border border-[var(--border-primary)]">
              <Wrench className="w-2.5 h-2.5" />
              {tc}
            </span>
          ))}
        </div>
      )}

      {/* View details */}
      <div className="flex justify-end pt-3 border-t border-[var(--bg-elevated)]">
        <span className="text-xs text-[#8b5cf6] group-hover:text-[#a78bfa] transition-colors inline-flex items-center gap-1">
          View details <ArrowRight className="w-3 h-3" />
        </span>
      </div>
    </div>
  );
}

// --------------- PercentBar ---------------

function PercentBar({ label, value, icon }: { label: string; value: number | null; icon: React.ReactNode }) {
  const pct = value !== null ? Math.min(100, Math.max(0, value)) : 0;
  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-[var(--text-muted)] flex items-center gap-1.5 font-medium">
          {icon}
          {label}
        </span>
        <span className="text-xs font-semibold text-[var(--text-primary)]">
          {value !== null ? `${Math.round(value)}%` : '--'}
        </span>
      </div>
      <div className="h-2 bg-[var(--bg-elevated)] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ease-out ${pctBarColor(pct)}`}
          style={{ width: `${pct}%` }}
        />
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    fetch(`/api/sessions/${sessionId}`)
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
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [sessionId]);

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (error || !session) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] p-6 md:p-8">
        <div className="max-w-7xl mx-auto">
          <button
            onClick={() => router.push('/sessions')}
            className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] mb-6 transition-colors group"
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

  const costPerTurn = turns.map((t, i) => ({
    turn: `T${i + 1}`,
    cost: session.totalCostUsd / (session.totalTurns || 1),
    tokens: t.responseTokensEst ?? 0,
  }));
  const contextPerTurn = turns.map((t, i) => ({
    turn: `T${i + 1}`,
    context: t.contextUsedPct ?? 0,
  }));

  const costPerTurnAvg = session.totalTurns > 0 ? session.totalCostUsd / session.totalTurns : 0;

  return (
    <div className={`min-h-screen bg-[var(--bg-primary)] p-6 md:p-8 transition-opacity duration-500 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
      <div className="max-w-7xl mx-auto">

        {/* Back button — go to developer detail page */}
        <button
          onClick={() => router.push(session.developerId ? `/dashboard/developers/${session.developerId}` : '/dashboard/developers')}
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] mb-6 transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          <span className="group-hover:underline underline-offset-4">
            {session.developerName ? `${session.developerName}'s Sessions` : 'Developers'}
          </span>
        </button>

        {/* Header section */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-[var(--text-primary)] mb-3">
            {sessionTitle(session)}
          </h1>
          <div className="flex flex-wrap items-center gap-3">
            {/* Intent badge */}
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${intentStyle.bg} ${intentStyle.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${intentStyle.dot}`} />
              {intent}
            </span>
            {/* Model */}
            <span className="text-xs text-[var(--text-muted)] bg-[var(--bg-elevated)] border border-[var(--border-primary)] px-2.5 py-1 rounded-full" title="AI model used for this session">
              {session.model ?? 'Unknown'}
            </span>
            {/* Turns */}
            <span className="text-xs text-[var(--text-muted)] flex items-center gap-1" title="Number of prompt-response exchanges">
              <Hash className="w-3 h-3" /> {session.totalTurns} turns
            </span>
            {/* Cost */}
            <span className="text-xs text-[var(--text-muted)] flex items-center gap-1" title="Total API cost for all turns in this session">
              <Coins className="w-3 h-3" /> {formatCost(session.totalCostUsd)}
            </span>
            {/* Duration */}
            <span className="text-xs text-[var(--text-muted)] flex items-center gap-1" title="Total session duration from first to last turn">
              <Clock className="w-3 h-3" /> {formatDuration(session.startedAt, session.endedAt)}
            </span>
          </div>
        </div>

        {/* Two-column layout (60/40) */}
        <div className="flex flex-col lg:flex-row gap-6 mb-8">

          {/* LEFT: Turn Timeline */}
          <div className="flex-1 lg:w-[60%] min-w-0">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-lg font-medium text-[var(--text-primary)]">Turn Timeline</h2>
              <span className="text-xs font-medium text-[var(--text-muted)] bg-[var(--bg-elevated)] border border-[var(--border-primary)] px-2 py-0.5 rounded-full">
                {turns.length}
              </span>
            </div>
            {turns.length === 0 ? (
              <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-12 text-center">
                <Info className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-3" />
                <p className="text-sm text-[var(--text-muted)]">No turns recorded.</p>
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
            <h2 className="text-lg font-medium text-[var(--text-primary)] mb-2">Session Metrics</h2>

            {/* Efficiency score ring */}
            <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-6 flex flex-col items-center" title="Efficiency Score measures overall session quality. Based on prompt scores, retries, token usage, and workflow efficiency. Score 0-100 where higher is better.">
              <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-medium mb-4">
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
            <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-5 grid grid-cols-2 gap-4">
              <div className="space-y-1" title="Total API cost for all turns in this session">
                <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-medium flex items-center gap-1.5">
                  <Coins className="w-3 h-3" /> Total Cost
                </p>
                <p className="text-xl font-semibold text-[var(--text-primary)] font-mono">{formatCost(session.totalCostUsd)}</p>
              </div>
              <div className="space-y-1" title="Total time from session start to end">
                <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-medium flex items-center gap-1.5">
                  <Clock className="w-3 h-3" /> Duration
                </p>
                <p className="text-xl font-semibold text-[var(--text-primary)]">{formatDuration(session.startedAt, session.endedAt)}</p>
              </div>
              <div className="space-y-1" title="Number of prompt-response exchanges in this session">
                <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-medium flex items-center gap-1.5">
                  <Hash className="w-3 h-3" /> Turns
                </p>
                <p className="text-xl font-semibold text-[var(--text-primary)]">{session.totalTurns}</p>
              </div>
              <div className="space-y-1" title="Number of tool calls made by the AI (file reads, edits, bash commands, etc.)">
                <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-medium flex items-center gap-1.5">
                  <Wrench className="w-3 h-3" /> Tool Calls
                </p>
                <p className="text-xl font-semibold text-[var(--text-primary)]">{session.totalToolCalls}</p>
              </div>
              <div className="space-y-1 col-span-2 pt-2 border-t border-[var(--bg-elevated)]" title="Average API cost per prompt-response turn. Lower means more cost-efficient prompting.">
                <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-medium flex items-center gap-1.5">
                  <Zap className="w-3 h-3" /> Cost per Turn (avg)
                </p>
                <p className="text-xl font-semibold text-[var(--text-primary)] font-mono">{formatCostPrecise(costPerTurnAvg)}</p>
              </div>
            </div>

            {/* Progress bars */}
            <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-5">
              <div title="Percentage of tokens wasted on retries, verbose prompts, or repeated context. Lower is better.">
                <PercentBar
                  label="Token Waste Ratio"
                  value={session.tokenWasteRatio !== null ? session.tokenWasteRatio * 100 : null}
                  icon={<AlertTriangle className="w-3.5 h-3.5" />}
                />
              </div>
              <div title="Maximum percentage of the AI model's context window used in any single turn. High values (>80%) may cause truncation.">
                <PercentBar
                  label="Context Peak Usage"
                  value={session.contextPeakPct}
                  icon={<Layers className="w-3.5 h-3.5" />}
                />
              </div>
            </div>

            {/* Cost per turn chart */}
            {costPerTurn.length > 1 && (
              <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-5">
                <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-medium mb-4 flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5" /> Cost per Turn
                </p>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={costPerTurn}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-elevated)" />
                    <XAxis dataKey="turn" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={{ stroke: 'var(--border-primary)' }} tickLine={false} />
                    <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={{ stroke: 'var(--border-primary)' }} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--bg-card)',
                        border: '1px solid var(--border-primary)',
                        borderRadius: 8,
                        color: 'var(--text-primary)',
                        fontSize: 12,
                        boxShadow: '0 10px 15px rgba(0,0,0,0.3)',
                      }}
                      labelStyle={{ color: 'var(--text-muted)' }}
                      itemStyle={{ color: 'var(--text-primary)' }}
                      formatter={(value: number) => [`$${value.toFixed(4)}`, 'Cost']}
                    />
                    <Bar dataKey="cost" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Context usage per turn */}
            {contextPerTurn.length > 1 && (
              <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-5">
                <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-medium mb-4 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" /> Context Usage per Turn
                </p>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={contextPerTurn}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-elevated)" />
                    <XAxis dataKey="turn" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={{ stroke: 'var(--border-primary)' }} tickLine={false} />
                    <YAxis
                      tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                      domain={[0, 100]}
                      unit="%"
                      axisLine={{ stroke: 'var(--border-primary)' }}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--bg-card)',
                        border: '1px solid var(--border-primary)',
                        borderRadius: 8,
                        color: 'var(--text-primary)',
                        fontSize: 12,
                        boxShadow: '0 10px 15px rgba(0,0,0,0.3)',
                      }}
                      labelStyle={{ color: 'var(--text-muted)' }}
                      itemStyle={{ color: 'var(--text-primary)' }}
                      formatter={(value: number) => [`${Math.round(value)}%`, 'Context']}
                    />
                    <Line
                      type="monotone"
                      dataKey="context"
                      stroke="#8b5cf6"
                      strokeWidth={2}
                      dot={{ fill: '#8b5cf6', r: 3, strokeWidth: 0 }}
                      activeDot={{ fill: '#a78bfa', r: 5, strokeWidth: 0 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Model recommendations */}
            {analysis?.modelRecommendations && analysis.modelRecommendations.length > 0 && (
              <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-5">
                <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-medium mb-4 flex items-center gap-1.5">
                  <Gauge className="w-3.5 h-3.5" /> Model Recommendations
                </p>
                <div className="space-y-2">
                  {analysis.modelRecommendations.map((rec, i) => (
                    <div
                      key={i}
                      className="text-xs bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg p-3 flex items-center justify-between"
                    >
                      <span className="text-[var(--text-secondary)]">
                        Turn {rec.turn}:
                        <span className="text-[var(--text-muted)] mx-1">{rec.used}</span>
                        <ChevronRight className="w-3 h-3 inline text-[var(--text-muted)]" />
                        <span className="text-[var(--text-primary)] ml-1 font-medium">{rec.recommended}</span>
                      </span>
                      <span className="text-emerald-400 font-medium">save {formatCost(rec.savingsUsd)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom: Session Analysis */}
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-6">
          <h2 className="text-lg font-medium text-[var(--text-primary)] mb-5 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-900/30 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-purple-400" />
            </div>
            Session Analysis
          </h2>
          {analysis ? (
            <div className="space-y-5">
              <div>
                <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-medium mb-2">Summary</p>
                <p className="text-sm text-[var(--text-primary)] leading-relaxed">{analysis.summary}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-medium mb-2">Top Tip</p>
                <div className="bg-yellow-900/10 border border-yellow-800/30 rounded-lg p-4 flex items-start gap-3">
                  <Lightbulb className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-yellow-300/90 leading-relaxed">{analysis.topTip}</p>
                </div>
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-medium mb-2">Rewritten First Prompt</p>
                <div className="bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg p-4">
                  <p className="text-sm text-[var(--text-primary)] italic leading-relaxed">
                    {analysis.rewrittenFirstPrompt}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <HeuristicAnalysis turns={turns} session={session} />
          )}
        </div>
      </div>
    </div>
  );
}
