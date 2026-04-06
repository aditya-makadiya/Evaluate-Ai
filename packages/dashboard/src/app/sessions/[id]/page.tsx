'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  Lightbulb,
  Sparkles,
  Clock,
  Coins,
  Gauge,
  Layers,
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
}

// --------------- Helpers ---------------

function formatCost(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return '—';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

function scoreColor(score: number | null): string {
  if (score === null) return 'text-[#737373]';
  if (score >= 70) return 'text-emerald-400';
  if (score >= 40) return 'text-yellow-400';
  return 'text-red-400';
}

function scoreBg(score: number | null): string {
  if (score === null) return 'bg-[#262626] text-[#737373]';
  if (score >= 70) return 'bg-emerald-900/40 text-emerald-400';
  if (score >= 40) return 'bg-yellow-900/40 text-yellow-400';
  return 'bg-red-900/40 text-red-400';
}

function pctBarColor(pct: number): string {
  if (pct >= 80) return 'bg-red-500';
  if (pct >= 50) return 'bg-yellow-500';
  return 'bg-emerald-500';
}

function parseJsonSafe<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

// --------------- Anti-pattern hints for heuristic analysis ---------------

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
  filler_words: { label: 'Filler words', tip: 'Remove "please", "could you" — saves tokens with no quality loss' },
};

function HeuristicAnalysis({ turns, session }: { turns: TurnData[]; session: SessionDetail }) {
  // Gather all anti-patterns across turns
  const patternCounts: Record<string, number> = {};
  const retryCount = turns.filter(t => {
    const ap = parseJsonSafe<string[]>(typeof t.antiPatterns === 'string' ? t.antiPatterns : JSON.stringify(t.antiPatterns), []);
    if (Array.isArray(ap)) {
      for (const p of ap) {
        const id = typeof p === 'string' ? p : (p as { id?: string })?.id;
        if (id) patternCounts[id] = (patternCounts[id] ?? 0) + 1;
      }
    }
    return false;
  }).length;

  const sortedPatterns = Object.entries(patternCounts).sort((a, b) => b[1] - a[1]);
  const scores = turns.map(t => t.heuristicScore ?? t.llmScore).filter((s): s is number => s !== null);
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const lowScoreTurns = turns.filter(t => (t.heuristicScore ?? 100) < 50);
  const highScoreTurns = turns.filter(t => (t.heuristicScore ?? 0) >= 70);

  // Generate summary
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

  // Top tip
  const topPattern = sortedPatterns[0];
  const topTip = topPattern
    ? ANTI_PATTERN_TIPS[topPattern[0]]?.tip ?? 'Add more context to your prompts for better results.'
    : highScoreTurns.length === turns.length
      ? 'Great prompting! Keep including file paths and error messages.'
      : 'Try including file paths, error messages, and expected behavior in your prompts.';

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div>
        <p className="text-sm text-[#737373] mb-1">Summary</p>
        <p className="text-sm text-[#ededed]">{summary}</p>
      </div>

      {/* Top Issues */}
      {sortedPatterns.length > 0 && (
        <div>
          <p className="text-sm text-[#737373] mb-2">Issues Found</p>
          <div className="space-y-2">
            {sortedPatterns.slice(0, 5).map(([id, count]) => {
              const info = ANTI_PATTERN_TIPS[id];
              return (
                <div key={id} className="bg-[#1a1a1a] border border-[#262626] rounded-md p-3 flex items-start justify-between gap-3">
                  <div>
                    <span className="text-sm font-medium text-[#ededed]">{info?.label ?? id}</span>
                    <p className="text-xs text-[#737373] mt-0.5">{info?.tip ?? ''}</p>
                  </div>
                  <span className="text-xs bg-[#262626] text-[#737373] px-2 py-0.5 rounded-full whitespace-nowrap">{count}x</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top Tip */}
      <div>
        <p className="text-sm text-[#737373] mb-1">Top Tip</p>
        <div className="bg-[#1a1a1a] border border-[#262626] rounded-md p-3">
          <p className="text-sm text-yellow-300">{topTip}</p>
        </div>
      </div>

      {/* Score breakdown */}
      <div>
        <p className="text-sm text-[#737373] mb-1">Turn Scores</p>
        <div className="flex gap-2 flex-wrap">
          {turns.map((t) => {
            const s = t.heuristicScore ?? t.llmScore;
            return (
              <span key={t.id} className={`text-xs font-medium px-2 py-1 rounded ${scoreBg(s)}`}>
                T{t.turnNumber}: {s !== null ? `${Math.round(s)}` : '?'}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// --------------- Sub-components ---------------

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
      className="bg-[#141414] border border-[#262626] rounded-lg p-4 cursor-pointer hover:border-[#404040] transition-colors"
      onClick={() => router.push(`/sessions/${sessionId}/turns/${turn.turnNumber}`)}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[#ededed] font-medium">Turn {turn.turnNumber}</span>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${scoreBg(score)}`}>
            {score !== null ? `${Math.round(score)}/100` : 'N/A'}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-[#737373]">
          {turn.responseTokensEst !== null && (
            <span>{formatTokens(turn.responseTokensEst)} tokens</span>
          )}
          {turn.latencyMs !== null && <span>{formatMs(turn.latencyMs)}</span>}
        </div>
      </div>

      {/* Prompt */}
      {turn.promptText && (
        <div className="mb-3">
          <p className="text-sm text-[#ededed]/80 whitespace-pre-wrap">
            {expanded || !promptLong ? turn.promptText : turn.promptText.slice(0, 200) + '...'}
          </p>
          {promptLong && (
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
              className="mt-1 text-xs text-blue-400 hover:text-blue-300 inline-flex items-center gap-1"
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
              className={`text-xs px-2 py-0.5 rounded-full ${
                ap.severity === 'high'
                  ? 'bg-red-900/30 text-red-400'
                  : ap.severity === 'medium'
                    ? 'bg-yellow-900/30 text-yellow-400'
                    : 'bg-[#262626] text-[#737373]'
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
        <div className="bg-[#1a1a1a] border border-[#262626] rounded-md p-3 mb-3">
          <div className="flex items-center gap-2 mb-1">
            <Lightbulb className="w-3.5 h-3.5 text-yellow-400" />
            <span className="text-xs font-medium text-[#ededed]">Suggestion</span>
            {turn.suggestionAccepted !== null && (
              <span
                className={`text-xs px-1.5 py-0.5 rounded-full ${
                  turn.suggestionAccepted
                    ? 'bg-emerald-900/40 text-emerald-400'
                    : 'bg-red-900/40 text-red-400'
                }`}
              >
                {turn.suggestionAccepted ? 'Accepted' : 'Rejected'}
              </span>
            )}
          </div>
          <p className="text-xs text-[#737373]">{turn.suggestionText}</p>
        </div>
      )}

      {/* Tool calls */}
      {toolCalls.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {toolCalls.map((tc, i) => (
            <span key={i} className="text-xs bg-[#262626] text-[#737373] px-2 py-0.5 rounded">
              {tc}
            </span>
          ))}
        </div>
      )}

      {/* View details link */}
      <div className="flex justify-end pt-2 border-t border-[#262626]/50">
        <span className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
          View details &rarr;
        </span>
      </div>
    </div>
  );
}

function PercentBar({ label, value, icon }: { label: string; value: number | null; icon: React.ReactNode }) {
  const pct = value !== null ? Math.min(100, Math.max(0, value)) : 0;
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm text-[#737373] flex items-center gap-1.5">
          {icon}
          {label}
        </span>
        <span className="text-sm font-medium text-[#ededed]">
          {value !== null ? `${Math.round(value)}%` : '—'}
        </span>
      </div>
      <div className="h-2 bg-[#262626] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${pctBarColor(pct)}`}
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

  useEffect(() => {
    fetch(`/api/sessions/${sessionId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        // API returns { session, turns, toolEvents, analysis }
        // Merge into the shape our component expects
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
    return (
      <div className="min-h-screen bg-[#0a0a0a] p-6 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#737373]" />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] p-6">
        <div className="max-w-6xl mx-auto">
          <button
            onClick={() => router.push('/sessions')}
            className="inline-flex items-center gap-1 text-sm text-[#737373] hover:text-[#ededed] mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Sessions
          </button>
          <div className="bg-red-900/30 border border-red-800 rounded-lg p-4 text-red-300">
            {error ?? 'Session not found'}
          </div>
        </div>
      </div>
    );
  }

  const analysis = parseJsonSafe<SessionAnalysis | null>(session.analysis, null);
  const turns = session.turns ?? [];
  const costPerTurn = turns.map((t, i) => ({
    turn: i + 1,
    cost: session.totalCostUsd / (session.totalTurns || 1),
    tokens: t.responseTokensEst ?? 0,
  }));
  const contextPerTurn = turns.map((t, i) => ({
    turn: i + 1,
    context: t.contextUsedPct ?? 0,
  }));

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-6">
      <div className="max-w-7xl mx-auto">
        {/* Back button */}
        <button
          onClick={() => router.push('/sessions')}
          className="inline-flex items-center gap-1 text-sm text-[#737373] hover:text-[#ededed] mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Sessions
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <h1 className="text-2xl font-semibold text-[#ededed]">
            Session {session.id?.slice(0, 8) ?? 'Unknown'}
          </h1>
          <span className="text-sm text-[#737373]">{session.model ?? 'Unknown model'}</span>
        </div>

        {/* Two-column layout */}
        <div className="flex flex-col lg:flex-row gap-6 mb-8">
          {/* LEFT: Turn timeline */}
          <div className="flex-1 lg:w-[60%] space-y-4">
            <h2 className="text-lg font-medium text-[#ededed] mb-2">Turn Timeline</h2>
            {turns.length === 0 ? (
              <p className="text-[#737373]">No turns recorded.</p>
            ) : (
              turns.map((turn) => <TurnCard key={turn.id} turn={turn} sessionId={sessionId} />)
            )}
          </div>

          {/* RIGHT: Session Metrics */}
          <div className="lg:w-[40%] space-y-4">
            <h2 className="text-lg font-medium text-[#ededed] mb-2">Session Metrics</h2>

            {/* Efficiency score */}
            <div className="bg-[#141414] border border-[#262626] rounded-lg p-5 text-center">
              <p className="text-sm text-[#737373] mb-1">Efficiency Score</p>
              <p className={`text-5xl font-bold ${scoreColor(session.efficiencyScore)}`}>
                {session.efficiencyScore !== null ? Math.round(session.efficiencyScore) : '—'}
              </p>
              <p className="text-xs text-[#737373] mt-1">/ 100</p>
            </div>

            {/* Bars */}
            <div className="bg-[#141414] border border-[#262626] rounded-lg p-5">
              <PercentBar
                label="Token Waste Ratio"
                value={session.tokenWasteRatio !== null ? session.tokenWasteRatio * 100 : null}
                icon={<AlertTriangle className="w-3.5 h-3.5" />}
              />
              <PercentBar
                label="Context Peak Usage"
                value={session.contextPeakPct}
                icon={<Layers className="w-3.5 h-3.5" />}
              />
            </div>

            {/* Stats */}
            <div className="bg-[#141414] border border-[#262626] rounded-lg p-5 grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-[#737373] flex items-center gap-1">
                  <Coins className="w-3 h-3" /> Total Cost
                </p>
                <p className="text-lg font-semibold text-[#ededed]">
                  {formatCost(session.totalCostUsd)}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#737373] flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Duration
                </p>
                <p className="text-lg font-semibold text-[#ededed]">
                  {formatDuration(session.startedAt, session.endedAt)}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#737373]">Turns</p>
                <p className="text-lg font-semibold text-[#ededed]">{session.totalTurns}</p>
              </div>
              <div>
                <p className="text-xs text-[#737373]">Tool Calls</p>
                <p className="text-lg font-semibold text-[#ededed]">{session.totalToolCalls}</p>
              </div>
            </div>

            {/* Cost per turn chart */}
            {costPerTurn.length > 1 && (
              <div className="bg-[#141414] border border-[#262626] rounded-lg p-5">
                <p className="text-sm text-[#737373] mb-3">Cost per Turn</p>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={costPerTurn}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                    <XAxis dataKey="turn" tick={{ fill: '#737373', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#737373', fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#141414',
                        border: '1px solid #262626',
                        borderRadius: 8,
                        color: '#ededed',
                        fontSize: 12,
                      }}
                      formatter={(value: number) => [`$${value.toFixed(4)}`, 'Cost']}
                    />
                    <Bar dataKey="cost" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Context usage per turn chart */}
            {contextPerTurn.length > 1 && (
              <div className="bg-[#141414] border border-[#262626] rounded-lg p-5">
                <p className="text-sm text-[#737373] mb-3">Context Usage per Turn</p>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={contextPerTurn}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                    <XAxis dataKey="turn" tick={{ fill: '#737373', fontSize: 11 }} />
                    <YAxis
                      tick={{ fill: '#737373', fontSize: 11 }}
                      domain={[0, 100]}
                      unit="%"
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#141414',
                        border: '1px solid #262626',
                        borderRadius: 8,
                        color: '#ededed',
                        fontSize: 12,
                      }}
                      formatter={(value: number) => [`${Math.round(value)}%`, 'Context']}
                    />
                    <Line
                      type="monotone"
                      dataKey="context"
                      stroke="#8b5cf6"
                      strokeWidth={2}
                      dot={{ fill: '#8b5cf6', r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Model recommendation */}
            {analysis?.modelRecommendations && analysis.modelRecommendations.length > 0 && (
              <div className="bg-[#141414] border border-[#262626] rounded-lg p-5">
                <p className="text-sm text-[#737373] mb-3 flex items-center gap-1.5">
                  <Gauge className="w-3.5 h-3.5" /> Model Recommendations
                </p>
                <div className="space-y-2">
                  {analysis.modelRecommendations.map((rec, i) => (
                    <div
                      key={i}
                      className="text-xs bg-[#1a1a1a] rounded-md p-2 flex justify-between"
                    >
                      <span className="text-[#ededed]">
                        Turn {rec.turn}: {rec.used} &rarr; {rec.recommended}
                      </span>
                      <span className="text-emerald-400">save {formatCost(rec.savingsUsd)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom: Session Analysis */}
        <div className="bg-[#141414] border border-[#262626] rounded-lg p-6">
          <h2 className="text-lg font-medium text-[#ededed] mb-4 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-400" /> Session Analysis
          </h2>
          {analysis ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-[#737373] mb-1">Summary</p>
                <p className="text-sm text-[#ededed]">{analysis.summary}</p>
              </div>
              <div>
                <p className="text-sm text-[#737373] mb-1">Top Tip</p>
                <div className="bg-[#1a1a1a] border border-[#262626] rounded-md p-3">
                  <p className="text-sm text-yellow-300">{analysis.topTip}</p>
                </div>
              </div>
              <div>
                <p className="text-sm text-[#737373] mb-1">Rewritten First Prompt</p>
                <div className="bg-[#1a1a1a] border border-[#262626] rounded-md p-3">
                  <p className="text-sm text-[#ededed] italic">
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
