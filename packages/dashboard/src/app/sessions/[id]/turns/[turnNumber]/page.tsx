'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Copy,
  Check,
  Loader2,
  Sparkles,
  Lightbulb,
  Plus,
  Zap,
  FileCode,
  Terminal,
  Clock,
  Coins,
  Target,
  Eye,
  Brain,
  Crosshair,
  Layers,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

// --------------- Types ---------------

interface TurnDetail {
  id: string;
  turnNumber: number;
  promptText: string | null;
  promptHash: string;
  promptTokensEst: number | null;
  heuristicScore: number | null;
  llmScore: number | null;
  antiPatterns: Array<string | { id: string; severity: string; hint: string; points?: number }>;
  scoreBreakdown: { specificity: number; context: number; clarity: number; actionability: number } | null;
  suggestionText: string | null;
  suggestionAccepted: boolean | null;
  responseTokensEst: number | null;
  toolCalls: string[];
  latencyMs: number | null;
  wasRetry: boolean;
  contextUsedPct: number | null;
  createdAt: string;
}

interface SessionInfo {
  id: string;
  model: string | null;
  projectDir: string | null;
  gitBranch: string | null;
  startedAt: string;
  totalTurns: number;
}

interface ResponseData {
  text: string;
  toolCalls: string[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    model: string;
  };
  costUsd: number;
}

interface IssueItem {
  id: string;
  severity: string;
  label: string;
  hint: string;
  impact: string;
}

interface MissingSignal {
  id: string;
  label: string;
  hint: string;
  impact: string;
}

interface ImprovementData {
  score: number;
  maxPossibleScore: number;
  issues: IssueItem[];
  missingSignals: MissingSignal[];
  rewriteExample: string;
  estimatedTokensSaved: number;
  estimatedCostSaved: number;
}

interface TurnDetailResponse {
  turn: TurnDetail;
  session: SessionInfo;
  response: ResponseData | null;
  improvement: ImprovementData;
}

// --------------- Helpers ---------------

function scoreColor(score: number): string {
  if (score >= 70) return '#34d399';
  if (score >= 40) return '#facc15';
  return '#f87171';
}

function scoreLabel(score: number): string {
  if (score >= 70) return 'Good';
  if (score >= 40) return 'Needs Work';
  return 'Poor';
}

function severityColor(severity: string): string {
  switch (severity) {
    case 'high': return 'bg-red-900/40 text-red-400 border-red-800/50';
    case 'medium': return 'bg-yellow-900/40 text-yellow-400 border-yellow-800/50';
    case 'low': return 'bg-blue-900/40 text-blue-400 border-blue-800/50';
    default: return 'bg-[#262626] text-[#737373] border-[#333]';
  }
}

function severityDot(severity: string): string {
  switch (severity) {
    case 'high': return 'bg-red-400';
    case 'medium': return 'bg-yellow-400';
    case 'low': return 'bg-blue-400';
    default: return 'bg-[#737373]';
  }
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function formatCost(usd: number): string {
  if (usd < 0.001) return `$${usd.toFixed(6)}`;
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(4)}`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / 86_400_000)}d ago`;
}

function normalizeAntiPattern(ap: string | { id: string; severity: string; hint: string; points?: number }): {
  id: string; severity: string; hint: string;
} {
  if (typeof ap === 'string') {
    return { id: ap, severity: 'medium', hint: '' };
  }
  return { id: ap.id, severity: ap.severity, hint: ap.hint };
}

// --------------- Circular Progress Ring ---------------

function ScoreRing({ score, size = 120 }: { score: number; size?: number }) {
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const color = scoreColor(score);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <defs>
          <linearGradient id={`scoreGrad-${score}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.8" />
            <stop offset="100%" stopColor={color} stopOpacity="1" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#262626"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#scoreGrad-${score})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-[#ededed]">{score}</span>
        <span className="text-xs text-[#737373]">/ 100</span>
      </div>
    </div>
  );
}

// --------------- Dimension Bar ---------------

function DimensionBar({ label, value, max, icon }: { label: string; value: number; max: number; icon: React.ReactNode }) {
  const pct = Math.round((value / max) * 100);
  const barColor = value >= max * 0.7 ? 'bg-emerald-500' : value >= max * 0.4 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-[#a3a3a3] flex items-center gap-1.5">
          {icon} {label}
        </span>
        <span className="text-xs font-medium text-[#ededed]">{value}/{max}</span>
      </div>
      <div className="h-2 bg-[#1a1a1a] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// --------------- Token Bar Segment ---------------

function TokenBar({ usage, costUsd }: { usage: ResponseData['usage']; costUsd: number }) {
  const segments = [
    { label: 'Input', tokens: usage.inputTokens, color: '#3b82f6' },
    { label: 'Output', tokens: usage.outputTokens, color: '#8b5cf6' },
    { label: 'Cache Read', tokens: usage.cacheReadTokens, color: '#06b6d4' },
    { label: 'Cache Write', tokens: usage.cacheWriteTokens, color: '#f59e0b' },
  ].filter(s => s.tokens > 0);

  const total = segments.reduce((sum, s) => sum + s.tokens, 0);

  return (
    <div className="space-y-3">
      {/* Visual bar */}
      <div className="h-4 bg-[#1a1a1a] rounded-full overflow-hidden flex">
        {segments.map((seg) => (
          <div
            key={seg.label}
            className="h-full transition-all duration-500"
            style={{
              width: `${(seg.tokens / total) * 100}%`,
              backgroundColor: seg.color,
            }}
            title={`${seg.label}: ${formatTokens(seg.tokens)}`}
          />
        ))}
      </div>
      {/* Legend */}
      <div className="grid grid-cols-2 gap-2">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }} />
            <div>
              <span className="text-xs text-[#a3a3a3]">{seg.label}</span>
              <span className="text-xs text-[#ededed] ml-1.5 font-medium">{formatTokens(seg.tokens)}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between text-xs pt-2 border-t border-[#262626]">
        <span className="text-[#737373]">Total: {formatTokens(total)} tokens</span>
        <span className="text-[#ededed] font-medium">{formatCost(costUsd)}</span>
      </div>
    </div>
  );
}

// --------------- Expandable Issue Card ---------------

function IssueCard({ issue }: { issue: IssueItem }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="bg-[#1a1a1a] border border-red-900/30 rounded-lg overflow-hidden hover:border-red-800/50 transition-colors cursor-pointer"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <span className="text-sm font-medium text-[#ededed]">{issue.label}</span>
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${severityColor(issue.severity)}`}>
            {issue.severity}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-red-400 font-medium">{issue.impact}</span>
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-[#737373]" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-[#737373]" />
          )}
        </div>
      </div>
      {expanded && (
        <div className="px-3 pb-3 border-t border-red-900/20">
          <p className="text-sm text-[#a3a3a3] mt-2 leading-relaxed">{issue.hint}</p>
        </div>
      )}
    </div>
  );
}

// --------------- Loading Skeleton ---------------

function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] p-6 animate-pulse">
      <div className="max-w-7xl mx-auto">
        <div className="h-4 bg-[#1a1a1a] rounded w-24 mb-6" />
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="h-8 bg-[#1a1a1a] rounded w-48 mb-3" />
            <div className="h-5 bg-[#1a1a1a] rounded w-96 mb-2" />
            <div className="h-4 bg-[#1a1a1a] rounded w-64" />
          </div>
          <div className="w-[120px] h-[120px] bg-[#1a1a1a] rounded-full" />
        </div>
        <div className="flex gap-6">
          <div className="flex-1 space-y-4">
            <div className="h-64 bg-[#141414] border border-[#262626] rounded-lg" />
          </div>
          <div className="w-[45%] space-y-4">
            <div className="h-48 bg-[#141414] border border-[#262626] rounded-lg" />
            <div className="h-48 bg-[#141414] border border-[#262626] rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}

// --------------- Main Page ---------------

export default function TurnDetailPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;
  const turnNumber = parseInt(params.turnNumber as string, 10);

  const [data, setData] = useState<TurnDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'prompt' | 'response' | 'tokens'>('prompt');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let refreshTimer: ReturnType<typeof setInterval> | null = null;

    const fetchData = () => {
      fetch(`/api/sessions/${sessionId}/turns/${turnNumber}`)
        .then(async (r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then((d) => {
          if (!cancelled) {
            setData(d);
            // Stop polling once we have response data
            if (d.response && refreshTimer) {
              clearInterval(refreshTimer);
              refreshTimer = null;
            }
          }
        })
        .catch((e) => { if (!cancelled) setError(e.message); })
        .finally(() => { if (!cancelled) setLoading(false); });
    };

    fetchData();

    // Auto-refresh every 3 seconds if response is not yet available
    refreshTimer = setInterval(() => {
      if (data?.response) {
        if (refreshTimer) clearInterval(refreshTimer);
        return;
      }
      fetchData();
    }, 3000);

    return () => {
      cancelled = true;
      if (refreshTimer) clearInterval(refreshTimer);
    };
  }, [sessionId, turnNumber]);

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  if (loading) return <LoadingSkeleton />;

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] p-6">
        <div className="max-w-7xl mx-auto">
          <button
            onClick={() => router.push(`/sessions/${sessionId}`)}
            className="inline-flex items-center gap-1 text-sm text-[#737373] hover:text-[#ededed] mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Session
          </button>
          <div className="bg-red-900/30 border border-red-800 rounded-lg p-4 text-red-300">
            {error ?? 'Turn not found'}
          </div>
        </div>
      </div>
    );
  }

  const { turn, session, response, improvement } = data;
  const score = turn.heuristicScore ?? turn.llmScore ?? improvement.score;
  const antiPatterns = (turn.antiPatterns ?? []).map(normalizeAntiPattern);
  const breakdown = turn.scoreBreakdown;

  // Estimate rewrite score
  const rewriteScore = Math.min(100, score + improvement.issues.reduce((s, i) => {
    const pts = parseInt(i.impact.replace(/[^0-9]/g, ''), 10);
    return s + (isNaN(pts) ? 0 : pts);
  }, 0) + improvement.missingSignals.reduce((s, ms) => {
    const pts = parseInt(ms.impact.replace(/[^0-9]/g, ''), 10);
    return s + (isNaN(pts) ? 0 : pts);
  }, 0));

  // Score breakdown chart data
  const breakdownData = breakdown ? [
    { name: 'Specificity', value: breakdown.specificity, max: 25 },
    { name: 'Context', value: breakdown.context, max: 25 },
    { name: 'Clarity', value: breakdown.clarity, max: 25 },
    { name: 'Actionability', value: breakdown.actionability, max: 25 },
  ] : null;

  // Pro tips based on issues
  const proTips: string[] = [];
  const issueIds = new Set(improvement.issues.map(i => i.id));
  const missingIds = new Set(improvement.missingSignals.map(m => m.id));
  if (issueIds.has('no_file_ref') || missingIds.has('has_file_path'))
    proTips.push('Always include file paths -- AI resolves code 40% faster with explicit locations.');
  if (issueIds.has('paraphrased_error') || missingIds.has('has_error_msg'))
    proTips.push('Paste exact error messages -- reduces clarification rounds by 60%.');
  if (issueIds.has('multi_question'))
    proTips.push('One question per turn -- split complex asks into steps for better results.');
  if (issueIds.has('no_expected_output'))
    proTips.push('State expected behavior -- helps AI validate its solution before responding.');
  if (issueIds.has('vague_verb') || issueIds.has('too_short'))
    proTips.push('Be specific about what to change and where -- vague requests lead to vague results.');
  if (issueIds.has('filler_words'))
    proTips.push('Skip pleasantries with AI -- "please" and "could you" cost tokens with zero quality gain.');
  if (proTips.length === 0) {
    proTips.push('Great prompt quality! Keep including context and constraints.');
    proTips.push('Consider adding test expectations to guide the AI toward verifiable solutions.');
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* =========== Section 1: Header + Score Hero =========== */}
        <button
          onClick={() => router.push(`/sessions/${sessionId}`)}
          className="inline-flex items-center gap-1 text-sm text-[#737373] hover:text-[#ededed] mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Session
        </button>

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-8">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-semibold text-[#ededed]">
                Turn {turn.turnNumber}
              </h1>
              <span className="text-sm text-[#737373]">of {session.totalTurns}</span>
              {turn.wasRetry && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-orange-900/40 text-orange-400 border border-orange-800/50">
                  Retry
                </span>
              )}
            </div>
            <p className="text-lg text-[#ededed]/80 mb-3 max-w-2xl leading-relaxed">
              &ldquo;{turn.promptText ? (turn.promptText.length > 120 ? turn.promptText.slice(0, 120) + '...' : turn.promptText) : 'No prompt text'}&rdquo;
            </p>
            <div className="flex items-center gap-3 text-sm text-[#737373] flex-wrap">
              <span className="flex items-center gap-1">
                <Terminal className="w-3.5 h-3.5" />
                {session.model ?? 'Unknown model'}
              </span>
              <span className="text-[#333]">|</span>
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {timeAgo(turn.createdAt)}
              </span>
              {response && (
                <>
                  <span className="text-[#333]">|</span>
                  <span className="flex items-center gap-1">
                    <Coins className="w-3.5 h-3.5" />
                    {formatCost(response.costUsd)}
                  </span>
                </>
              )}
              {turn.latencyMs !== null && (
                <>
                  <span className="text-[#333]">|</span>
                  <span>{turn.latencyMs < 1000 ? `${turn.latencyMs}ms` : `${(turn.latencyMs / 1000).toFixed(1)}s`}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex-shrink-0">
            <ScoreRing score={Math.round(score)} size={120} />
            <p className="text-center text-xs mt-2 font-medium" style={{ color: scoreColor(score) }}>
              {scoreLabel(score)}
            </p>
          </div>
        </div>

        {/* =========== Section 2: Two-column layout =========== */}
        <div className="flex flex-col lg:flex-row gap-6 mb-8">
          {/* LEFT COLUMN — Prompt vs Response */}
          <div className="flex-1 lg:w-[55%]">
            {/* Tabs */}
            <div className="flex border-b border-[#262626] mb-0">
              {(['prompt', 'response', 'tokens'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                    activeTab === tab
                      ? 'text-[#ededed] border-blue-500'
                      : 'text-[#737373] border-transparent hover:text-[#a3a3a3] hover:border-[#404040]'
                  }`}
                >
                  {tab === 'prompt' && 'Your Prompt'}
                  {tab === 'response' && 'AI Response'}
                  {tab === 'tokens' && 'Token Breakdown'}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="bg-[#141414] border border-[#262626] border-t-0 rounded-b-lg p-5 min-h-[400px]">
              {/* --- Prompt Tab --- */}
              {activeTab === 'prompt' && (
                <div>
                  <div className="bg-[#0a0a0a] border border-[#262626] rounded-lg p-4 mb-4">
                    <pre className="text-sm text-[#ededed]/90 whitespace-pre-wrap break-words font-mono leading-relaxed">
                      {turn.promptText || 'No prompt text available'}
                    </pre>
                  </div>

                  {/* Anti-pattern tags */}
                  {antiPatterns.length > 0 && (
                    <div>
                      <p className="text-xs text-[#737373] mb-2 uppercase tracking-wider">Issues Detected</p>
                      <div className="flex flex-wrap gap-2">
                        {antiPatterns.map((ap, i) => (
                          <span
                            key={i}
                            className={`text-xs font-medium px-2.5 py-1 rounded-full border cursor-default ${severityColor(ap.severity)}`}
                            title={ap.hint}
                          >
                            <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${severityDot(ap.severity)}`} />
                            {ap.id.replace(/_/g, ' ')}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {antiPatterns.length === 0 && (
                    <div className="flex items-center gap-2 text-emerald-400">
                      <CheckCircle2 className="w-4 h-4" />
                      <span className="text-sm">No anti-patterns detected</span>
                    </div>
                  )}

                  {/* Prompt metadata */}
                  <div className="mt-4 pt-4 border-t border-[#262626] flex gap-4 text-xs text-[#737373]">
                    {turn.promptTokensEst !== null && (
                      <span>~{formatTokens(turn.promptTokensEst)} tokens</span>
                    )}
                    {turn.contextUsedPct !== null && (
                      <span>Context: {Math.round(turn.contextUsedPct)}%</span>
                    )}
                  </div>
                </div>
              )}

              {/* --- Response Tab --- */}
              {activeTab === 'response' && (
                <div>
                  {response ? (
                    <>
                      <div className="bg-[#0a0a0a] border border-[#262626] rounded-lg p-4 mb-4 max-h-[500px] overflow-y-auto">
                        <pre className="text-sm text-[#ededed]/90 whitespace-pre-wrap break-words leading-relaxed">
                          {response.text || 'Empty response'}
                        </pre>
                      </div>

                      {/* Tool calls */}
                      {response.toolCalls.length > 0 && (
                        <div className="mb-4">
                          <p className="text-xs text-[#737373] mb-2 uppercase tracking-wider">Tool Calls</p>
                          <div className="flex flex-wrap gap-2">
                            {response.toolCalls.map((tc, i) => (
                              <span key={i} className="text-xs bg-[#1a1a1a] border border-[#262626] text-[#a3a3a3] px-2.5 py-1 rounded-md flex items-center gap-1.5">
                                <FileCode className="w-3 h-3" />
                                {tc}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Token usage mini bar */}
                      <TokenBar usage={response.usage} costUsd={response.costUsd} />
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <div className="relative mb-3">
                        <Brain className="w-10 h-10 text-blue-400 animate-pulse" />
                      </div>
                      <p className="text-sm text-[#ededed] mb-1">AI is generating response...</p>
                      <p className="text-xs text-[#525252]">
                        Response will appear here automatically once complete
                      </p>
                      <div className="flex gap-1 mt-3">
                        <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* --- Tokens Tab --- */}
              {activeTab === 'tokens' && (
                <div>
                  {response ? (
                    <div className="space-y-6">
                      <TokenBar usage={response.usage} costUsd={response.costUsd} />

                      {/* Detailed chart */}
                      <div>
                        <p className="text-xs text-[#737373] mb-3 uppercase tracking-wider">Token Distribution</p>
                        <ResponsiveContainer width="100%" height={200}>
                          <BarChart
                            data={[
                              { name: 'Input', tokens: response.usage.inputTokens, fill: '#3b82f6' },
                              { name: 'Output', tokens: response.usage.outputTokens, fill: '#8b5cf6' },
                              { name: 'Cache Read', tokens: response.usage.cacheReadTokens, fill: '#06b6d4' },
                              { name: 'Cache Write', tokens: response.usage.cacheWriteTokens, fill: '#f59e0b' },
                            ].filter(d => d.tokens > 0)}
                            layout="vertical"
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                            <XAxis type="number" tick={{ fill: '#737373', fontSize: 11 }} />
                            <YAxis dataKey="name" type="category" tick={{ fill: '#737373', fontSize: 11 }} width={90} />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: '#141414',
                                border: '1px solid #262626',
                                borderRadius: 8,
                                color: '#ededed',
                                fontSize: 12,
                              }}
                              formatter={(value: number) => [formatTokens(value), 'Tokens']}
                            />
                            <Bar dataKey="tokens" radius={[0, 4, 4, 0]}>
                              {[
                                { name: 'Input', tokens: response.usage.inputTokens, fill: '#3b82f6' },
                                { name: 'Output', tokens: response.usage.outputTokens, fill: '#8b5cf6' },
                                { name: 'Cache Read', tokens: response.usage.cacheReadTokens, fill: '#06b6d4' },
                                { name: 'Cache Write', tokens: response.usage.cacheWriteTokens, fill: '#f59e0b' },
                              ].filter(d => d.tokens > 0).map((entry, idx) => (
                                <Cell key={idx} fill={entry.fill} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>

                      {/* Cost breakdown */}
                      <div className="bg-[#0a0a0a] border border-[#262626] rounded-lg p-4">
                        <p className="text-xs text-[#737373] mb-2 uppercase tracking-wider">Cost Summary</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <p className="text-xs text-[#525252]">Model</p>
                            <p className="text-sm text-[#ededed] font-medium">{response.usage.model}</p>
                          </div>
                          <div>
                            <p className="text-xs text-[#525252]">Turn Cost</p>
                            <p className="text-sm text-[#ededed] font-medium">{formatCost(response.costUsd)}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <Layers className="w-10 h-10 text-blue-400 animate-pulse mb-3" />
                      <p className="text-sm text-[#ededed]">Waiting for response to complete...</p>
                      <p className="text-xs text-[#525252]">Token breakdown will appear after AI finishes responding</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN — How to Improve */}
          <div className="lg:w-[45%] space-y-4">
            <h2 className="text-lg font-medium text-[#ededed] flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-400" />
              How to Improve This Prompt
            </h2>

            {/* Score Breakdown Card */}
            {breakdownData && (
              <div className="bg-[#141414] border border-[#262626] rounded-lg p-5 hover:border-[#333] transition-colors">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-medium text-[#ededed]">Score Breakdown</p>
                  <span className="text-2xl font-bold" style={{ color: scoreColor(score) }}>
                    {Math.round(score)}
                  </span>
                </div>
                <DimensionBar label="Specificity" value={breakdownData[0].value} max={25} icon={<Crosshair className="w-3 h-3" />} />
                <DimensionBar label="Context" value={breakdownData[1].value} max={25} icon={<Layers className="w-3 h-3" />} />
                <DimensionBar label="Clarity" value={breakdownData[2].value} max={25} icon={<Eye className="w-3 h-3" />} />
                <DimensionBar label="Actionability" value={breakdownData[3].value} max={25} icon={<Target className="w-3 h-3" />} />
              </div>
            )}

            {/* Issues Found Card */}
            {improvement.issues.length > 0 && (
              <div className="bg-[#141414] border border-[#262626] rounded-lg p-5 hover:border-[#333] transition-colors">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  <p className="text-sm font-medium text-[#ededed]">Issues Found</p>
                  <span className="text-xs bg-red-900/30 text-red-400 px-2 py-0.5 rounded-full">
                    {improvement.issues.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {improvement.issues.map((issue) => (
                    <IssueCard key={issue.id} issue={issue} />
                  ))}
                </div>
              </div>
            )}

            {/* Missing Signals Card */}
            {improvement.missingSignals.length > 0 && (
              <div className="bg-[#141414] border border-[#262626] rounded-lg p-5 hover:border-[#333] transition-colors">
                <div className="flex items-center gap-2 mb-3">
                  <Plus className="w-4 h-4 text-emerald-400" />
                  <p className="text-sm font-medium text-[#ededed]">Missing Signals</p>
                  <span className="text-xs bg-emerald-900/30 text-emerald-400 px-2 py-0.5 rounded-full">
                    +{improvement.missingSignals.reduce((sum, ms) => {
                      const pts = parseInt(ms.impact.replace(/[^0-9]/g, ''), 10);
                      return sum + (isNaN(pts) ? 0 : pts);
                    }, 0)} pts possible
                  </span>
                </div>
                <div className="space-y-2">
                  {improvement.missingSignals.map((signal) => (
                    <div
                      key={signal.id}
                      className="bg-[#1a1a1a] border border-emerald-900/20 rounded-lg p-3 flex items-start justify-between gap-3 hover:border-emerald-800/40 transition-colors"
                    >
                      <div className="flex items-start gap-2.5">
                        <Plus className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-[#ededed]">{signal.label}</p>
                          <p className="text-xs text-[#737373] mt-0.5">{signal.hint}</p>
                        </div>
                      </div>
                      <span className="text-xs text-emerald-400 font-medium whitespace-nowrap">{signal.impact}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Suggested Rewrite Card */}
            <div className="relative bg-[#141414] rounded-lg p-5 overflow-hidden hover:shadow-lg hover:shadow-blue-900/5 transition-all"
              style={{
                border: '1px solid transparent',
                backgroundClip: 'padding-box',
                backgroundImage: 'linear-gradient(#141414, #141414), linear-gradient(135deg, #3b82f6, #8b5cf6, #3b82f6)',
                backgroundOrigin: 'border-box',
              }}
            >
              {/* Gradient border effect via box shadow */}
              <div className="absolute inset-0 rounded-lg" style={{
                background: 'linear-gradient(135deg, rgba(59,130,246,0.1), rgba(139,92,246,0.1))',
                pointerEvents: 'none',
              }} />

              <div className="relative">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-blue-400" />
                    <p className="text-sm font-medium text-[#ededed]">Improved Version</p>
                  </div>
                  <button
                    onClick={() => handleCopy(improvement.rewriteExample)}
                    className="flex items-center gap-1 text-xs text-[#737373] hover:text-[#ededed] transition-colors px-2 py-1 rounded-md hover:bg-[#262626]"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>

                <div className="bg-[#0a0a0a] border border-[#262626] rounded-lg p-4 mb-3">
                  <pre className="text-sm text-[#ededed]/90 whitespace-pre-wrap break-words font-mono leading-relaxed">
                    {improvement.rewriteExample}
                  </pre>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs">
                  <span className="text-[#737373]">
                    Estimated savings: ~{formatTokens(improvement.estimatedTokensSaved)} tokens ({formatCost(improvement.estimatedCostSaved)})
                  </span>
                  <span className="flex items-center gap-1 font-medium" style={{ color: scoreColor(rewriteScore) }}>
                    <Zap className="w-3 h-3" />
                    This rewrite would score ~{rewriteScore}/100
                  </span>
                </div>
              </div>
            </div>

            {/* Pro Tips Card */}
            <div className="bg-[#141414] border border-[#262626] rounded-lg p-5 hover:border-[#333] transition-colors">
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb className="w-4 h-4 text-yellow-400" />
                <p className="text-sm font-medium text-[#ededed]">Pro Tips</p>
              </div>
              <div className="space-y-2.5">
                {proTips.slice(0, 4).map((tip, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <Brain className="w-3.5 h-3.5 text-[#525252] mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-[#a3a3a3] leading-relaxed">{tip}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* =========== Section 3: Navigation =========== */}
        <div className="flex items-center justify-between pt-6 border-t border-[#262626]">
          <button
            onClick={() => router.push(`/sessions/${sessionId}/turns/${turnNumber - 1}`)}
            disabled={turnNumber <= 1}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              turnNumber <= 1
                ? 'text-[#404040] cursor-not-allowed'
                : 'text-[#a3a3a3] hover:text-[#ededed] hover:bg-[#141414] border border-[#262626]'
            }`}
          >
            <ArrowLeft className="w-4 h-4" />
            Previous Turn
          </button>

          <button
            onClick={() => router.push(`/sessions/${sessionId}`)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-[#737373] hover:text-[#ededed] hover:bg-[#141414] border border-[#262626] transition-colors"
          >
            Back to Session
          </button>

          <button
            onClick={() => router.push(`/sessions/${sessionId}/turns/${turnNumber + 1}`)}
            disabled={turnNumber >= session.totalTurns}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              turnNumber >= session.totalTurns
                ? 'text-[#404040] cursor-not-allowed'
                : 'text-[#a3a3a3] hover:text-[#ededed] hover:bg-[#141414] border border-[#262626]'
            }`}
          >
            Next Turn
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
