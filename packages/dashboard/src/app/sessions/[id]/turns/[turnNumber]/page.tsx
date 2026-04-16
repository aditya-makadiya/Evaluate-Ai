'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
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
  Tag,
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
  endedAt: string | null;
  totalTurns: number;
  developerId: string | null;
  developerName: string | null;
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
  if (score >= 80) return '#22c55e';
  if (score >= 60) return '#3b82f6';
  if (score >= 40) return '#eab308';
  return '#ef4444';
}

function scoreGradient(score: number): [string, string] {
  if (score >= 80) return ['#8b5cf6', '#22c55e'];
  if (score >= 60) return ['#8b5cf6', '#3b82f6'];
  if (score >= 40) return ['#8b5cf6', '#eab308'];
  return ['#8b5cf6', '#ef4444'];
}

function scoreLabel(score: number): string {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Needs Work';
  return 'Poor';
}

function severityColor(severity: string): string {
  switch (severity) {
    case 'high': return 'bg-red-900/40 text-red-400 border-red-800/50';
    case 'medium': return 'bg-yellow-900/40 text-yellow-400 border-yellow-800/50';
    case 'low': return 'bg-blue-900/40 text-blue-400 border-blue-800/50';
    default: return 'bg-border-primary text-text-muted border-border-hover';
  }
}

function severityDot(severity: string): string {
  switch (severity) {
    case 'high': return 'bg-red-400';
    case 'medium': return 'bg-yellow-400';
    case 'low': return 'bg-blue-400';
    default: return 'bg-text-muted';
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

// --------------- Animated Score Ring ---------------

function ScoreRing({ score, size = 140 }: { score: number; size?: number }) {
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const [animatedOffset, setAnimatedOffset] = useState(circumference);
  const [gradStart, gradEnd] = scoreGradient(score);
  const gradId = `scoreRingGrad-${score}-${size}`;

  useEffect(() => {
    // Start with full offset (empty ring), then animate to target
    const timer = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setAnimatedOffset(circumference - progress);
      });
    });
    return () => cancelAnimationFrame(timer);
  }, [circumference, progress]);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* Purple glow behind ring */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle, rgba(139, 92, 246, 0.15) 0%, transparent 70%)`,
          filter: 'blur(20px)',
          transform: 'scale(1.3)',
        }}
      />
      <svg width={size} height={size} className="relative transform -rotate-90">
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={gradStart} />
            <stop offset="100%" stopColor={gradEnd} />
          </linearGradient>
        </defs>
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--bg-elevated)"
          strokeWidth={strokeWidth}
        />
        {/* Animated progress stroke */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={animatedOffset ?? circumference}
          style={{
            transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold text-text-primary">{score}</span>
        <span className="text-[11px] text-text-muted font-medium mt-0.5">/ 100</span>
      </div>
    </div>
  );
}

// --------------- Dimension Bar ---------------

function DimensionBar({ label, value, max, icon }: { label: string; value: number; max: number; icon: React.ReactNode }) {
  const pct = Math.round((value / max) * 100);
  const barColor = value >= max * 0.7 ? 'bg-emerald-500' : value >= max * 0.4 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="mb-3.5 last:mb-0">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-text-secondary flex items-center gap-1.5">
          {icon} {label}
        </span>
        <span className="text-xs font-semibold text-text-primary">{value}/{max}</span>
      </div>
      <div className="h-2 bg-bg-elevated rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ease-out ${barColor}`}
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
      <div className="h-3.5 bg-bg-elevated rounded-full overflow-hidden flex">
        {segments.map((seg) => (
          <div
            key={seg.label}
            className="h-full transition-all duration-700 first:rounded-l-full last:rounded-r-full"
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
              <span className="text-xs text-text-secondary">{seg.label}</span>
              <span className="text-xs text-text-primary ml-1.5 font-medium">{formatTokens(seg.tokens)}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between text-xs pt-2 border-t border-border-primary">
        <span className="text-text-muted">Total: {formatTokens(total)} tokens</span>
        <span className="text-text-primary font-medium">{formatCost(costUsd)}</span>
      </div>
    </div>
  );
}

// --------------- Expandable Issue Card ---------------

function IssueCard({ issue }: { issue: IssueItem }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="bg-bg-primary border border-red-900/30 rounded-lg overflow-hidden hover:border-red-800/50 transition-all duration-200 cursor-pointer group"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center justify-between p-3.5">
        <div className="flex items-center gap-2.5">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${severityDot(issue.severity)}`} />
          <span className="text-sm font-medium text-text-primary">{issue.label}</span>
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${severityColor(issue.severity)}`}>
            {issue.severity}
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="text-xs text-red-400 font-semibold bg-red-900/20 px-2 py-0.5 rounded-full">{issue.impact}</span>
          <div className="text-text-muted group-hover:text-text-muted transition-colors">
            {expanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </div>
        </div>
      </div>
      <div
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{
          maxHeight: expanded ? 200 : 0,
          opacity: expanded ? 1 : 0,
        }}
      >
        <div className="px-3.5 pb-3.5 border-t border-red-900/20">
          <p className="text-sm text-text-secondary mt-2.5 leading-relaxed">{issue.hint}</p>
        </div>
      </div>
    </div>
  );
}

// --------------- Loading Skeleton ---------------

function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-bg-primary p-6">
      <div className="max-w-7xl mx-auto animate-pulse">
        <div className="h-4 bg-bg-elevated rounded w-24 mb-8" />
        {/* Hero skeleton */}
        <div className="flex items-start justify-between mb-10">
          <div className="flex-1 space-y-4">
            <div className="h-8 bg-bg-elevated rounded w-48" />
            <div className="h-20 bg-bg-secondary border border-bg-elevated rounded-lg w-full max-w-xl" />
            <div className="flex gap-3">
              <div className="h-7 bg-bg-elevated rounded-full w-24" />
              <div className="h-7 bg-bg-elevated rounded-full w-28" />
              <div className="h-7 bg-bg-elevated rounded-full w-20" />
            </div>
          </div>
          <div className="w-[140px] h-[140px] bg-bg-elevated rounded-full ml-8" />
        </div>
        {/* Two column skeleton */}
        <div className="flex gap-6">
          <div className="flex-1 space-y-0">
            <div className="flex gap-1 mb-0">
              <div className="h-10 bg-bg-card rounded-t-lg w-28" />
              <div className="h-10 bg-bg-secondary rounded-t-lg w-28" />
              <div className="h-10 bg-bg-secondary rounded-t-lg w-28" />
            </div>
            <div className="h-[450px] bg-bg-card border border-border-primary rounded-b-lg" />
          </div>
          <div className="w-[45%] space-y-4">
            <div className="h-6 bg-bg-elevated rounded w-48" />
            <div className="h-52 bg-bg-card border border-border-primary rounded-lg" />
            <div className="h-40 bg-bg-card border border-border-primary rounded-lg" />
            <div className="h-48 bg-bg-card border border-border-primary rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}

// --------------- Tab Underline Indicator ---------------

function TabBar({
  activeTab,
  setActiveTab,
}: {
  activeTab: 'prompt' | 'response' | 'tokens';
  setActiveTab: (t: 'prompt' | 'response' | 'tokens') => void;
}) {
  const tabs = [
    { key: 'prompt' as const, label: 'Your Prompt' },
    { key: 'response' as const, label: 'AI Response' },
    { key: 'tokens' as const, label: 'Token Breakdown' },
  ];

  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  useEffect(() => {
    const activeIndex = tabs.findIndex((t) => t.key === activeTab);
    const el = tabRefs.current[activeIndex];
    if (el) {
      const parent = el.parentElement;
      if (parent) {
        setIndicator({
          left: el.offsetLeft,
          width: el.offsetWidth,
        });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  return (
    <div className="relative flex border-b border-border-primary">
      {tabs.map((tab, i) => (
        <button
          key={tab.key}
          ref={(el) => { tabRefs.current[i] = el; }}
          onClick={() => setActiveTab(tab.key)}
          className={`relative px-5 py-3.5 text-sm font-medium transition-colors z-10 ${
            activeTab === tab.key
              ? 'text-[#8b5cf6]'
              : 'text-text-muted hover:text-text-secondary'
          }`}
        >
          {tab.label}
        </button>
      ))}
      {/* Sliding purple underline — tracks actual tab width */}
      <div
        className="absolute bottom-0 h-[2px] bg-[#8b5cf6] transition-all duration-300 ease-out rounded-full"
        style={{
          left: indicator.left,
          width: indicator.width,
        }}
      />
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
  const dataRef = useRef<TurnDetailResponse | null>(null);
  useEffect(() => { dataRef.current = data; }, [data]);

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
            // Stop polling once we have response data or session has ended
            if ((d.response || d.session?.endedAt) && refreshTimer) {
              clearInterval(refreshTimer);
              refreshTimer = null;
            }
          }
        })
        .catch((e) => { if (!cancelled) setError(e.message); })
        .finally(() => { if (!cancelled) setLoading(false); });
    };

    fetchData();

    // Auto-refresh every 3 seconds if response is not yet available and session is still active
    refreshTimer = setInterval(() => {
      if (dataRef.current?.response || dataRef.current?.session?.endedAt) {
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

  // Keyboard navigation: left/right arrow keys for prev/next turn
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't navigate if user is typing in an input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (!data) return;

      if (e.key === 'ArrowLeft' && turnNumber > 1) {
        router.push(`/sessions/${sessionId}/turns/${turnNumber - 1}`);
      } else if (e.key === 'ArrowRight' && turnNumber < data.session.totalTurns) {
        router.push(`/sessions/${sessionId}/turns/${turnNumber + 1}`);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [data, turnNumber, sessionId, router]);

  if (loading) return <LoadingSkeleton />;

  if (error || !data) {
    return (
      <div className="min-h-screen bg-bg-primary p-6">
        <div className="max-w-7xl mx-auto">
          <button
            onClick={() => router.push(`/sessions/${sessionId}`)}
            className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Session
          </button>
          <div className="bg-red-900/20 border border-red-800/50 rounded-lg p-5 text-red-300 text-sm">
            {error ?? 'Turn not found'}
          </div>
        </div>
      </div>
    );
  }

  const { turn, session, response, improvement } = data;
  const score = turn.heuristicScore ?? turn.llmScore ?? improvement.score;
  const rawAP = turn.antiPatterns ?? [];
  const parsedAP: Array<string | { id: string; severity: string; hint: string; points?: number }> = typeof rawAP === 'string' ? (() => { try { return JSON.parse(rawAP); } catch { return []; } })() : Array.isArray(rawAP) ? rawAP : [];
  const antiPatterns = parsedAP.map(normalizeAntiPattern);
  const breakdown = typeof turn.scoreBreakdown === 'string' ? (() => { try { return JSON.parse(turn.scoreBreakdown); } catch { return null; } })() : turn.scoreBreakdown;

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
    <div className="min-h-screen bg-bg-primary p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* =========== Breadcrumb Navigation =========== */}
        <nav className="flex items-center gap-1.5 text-sm mb-8">
          <button
            onClick={() => router.push(session.developerId ? `/dashboard/developers/${session.developerId}` : '/dashboard/developers')}
            className="text-text-muted hover:text-text-primary transition-colors"
          >
            {session.developerName ?? 'Developer'}
          </button>
          <ChevronRight className="w-3.5 h-3.5 text-text-muted" />
          <button
            onClick={() => router.push(`/sessions/${sessionId}`)}
            className="text-text-muted hover:text-text-primary transition-colors"
          >
            Session
          </button>
          <ChevronRight className="w-3.5 h-3.5 text-text-muted" />
          <span className="text-text-primary font-medium">Turn {turnNumber}</span>
        </nav>

        {/* =========== Hero Section =========== */}
        <div className="flex flex-col md:flex-row items-start justify-between gap-8 mb-10">
          {/* Left: Turn info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-4">
              {/* Prev/Next navigation inline with turn title */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => router.push(`/sessions/${sessionId}/turns/${turnNumber - 1}`)}
                  disabled={turnNumber <= 1}
                  title="Previous turn (← arrow key)"
                  className={`p-1.5 rounded-md transition-all ${
                    turnNumber <= 1
                      ? 'text-text-muted/30 cursor-not-allowed'
                      : 'text-text-muted hover:text-text-primary hover:bg-bg-elevated'
                  }`}
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h1 className="text-3xl font-bold text-text-primary tracking-tight">
                  Turn {turn.turnNumber}
                </h1>
                <span className="text-sm text-text-muted font-medium">of {session.totalTurns}</span>
                <button
                  onClick={() => router.push(`/sessions/${sessionId}/turns/${turnNumber + 1}`)}
                  disabled={turnNumber >= session.totalTurns}
                  title="Next turn (→ arrow key)"
                  className={`p-1.5 rounded-md transition-all ${
                    turnNumber >= session.totalTurns
                      ? 'text-text-muted/30 cursor-not-allowed'
                      : 'text-text-muted hover:text-text-primary hover:bg-bg-elevated'
                  }`}
                >
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
              {turn.wasRetry && (
                <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-orange-900/40 text-orange-400 border border-orange-800/50 uppercase tracking-wider">
                  Retry
                </span>
              )}
            </div>

            {/* Prompt quote block */}
            <div className="relative pl-4 mb-5 border-l-2 border-purple-500/40">
              <p className="text-base text-text-secondary leading-relaxed italic">
                &ldquo;{turn.promptText ? (turn.promptText.length > 160 ? turn.promptText.slice(0, 160) + '...' : turn.promptText) : 'No prompt text'}&rdquo;
              </p>
            </div>

            {/* Metadata pills */}
            <div className="flex items-center gap-2 flex-wrap">
              {session.model && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-bg-card border border-border-primary text-text-secondary" title="AI model used for this session">
                  <Terminal className="w-3 h-3" />
                  {session.model}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-bg-card border border-border-primary text-text-secondary" title="When this turn was submitted">
                <Clock className="w-3 h-3" />
                {timeAgo(turn.createdAt)}
              </span>
              {turn.latencyMs !== null && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-bg-card border border-border-primary text-text-secondary" title="Time taken for the AI to respond">
                  <Zap className="w-3 h-3" />
                  {turn.latencyMs < 1000 ? `${turn.latencyMs}ms` : `${(turn.latencyMs / 1000).toFixed(1)}s`}
                </span>
              )}
              {response && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-bg-card border border-border-primary text-text-secondary" title="API cost for this single turn (prompt + response tokens)">
                  <Coins className="w-3 h-3" />
                  {formatCost(response.costUsd)}
                </span>
              )}
              {antiPatterns.length > 0 && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-purple-900/30 border border-purple-800/40 text-purple-400" title="Prompt anti-patterns detected: common mistakes that reduce AI response quality">
                  <Tag className="w-3 h-3" />
                  {antiPatterns.length} issue{antiPatterns.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>

          {/* Right: Score Ring */}
          <div className="flex-shrink-0 flex flex-col items-center">
            <ScoreRing score={Math.round(score)} size={140} />
            <p
              className="text-center text-sm mt-3 font-semibold tracking-wide uppercase"
              style={{ color: scoreColor(score) }}
              title="Prompt Quality Score (0-100): Measures how specific, contextual, clear, and actionable your prompt is. Each dimension contributes up to 25 points."
            >
              {scoreLabel(score)}
            </p>
          </div>
        </div>

        {/* =========== Two-Column Layout =========== */}
        <div className="flex flex-col lg:flex-row gap-6 mb-10">
          {/* LEFT COLUMN: Tabbed Content (55%) */}
          <div className="flex-1 lg:w-[55%] min-w-0">
            <TabBar activeTab={activeTab} setActiveTab={setActiveTab} />

            <div className="bg-bg-card border border-border-primary border-t-0 rounded-b-lg p-5 min-h-[420px]">
              {/* --- Prompt Tab --- */}
              {activeTab === 'prompt' && (
                <div>
                  <div className="bg-bg-primary border border-bg-elevated rounded-lg p-5 mb-5">
                    <pre className="text-sm text-text-primary/90 whitespace-pre-wrap break-words font-mono leading-relaxed">
                      {turn.promptText || 'No prompt text available'}
                    </pre>
                  </div>

                  {/* Anti-pattern tags */}
                  {antiPatterns.length > 0 && (
                    <div>
                      <p className="text-[11px] text-text-muted mb-2.5 uppercase tracking-widest font-semibold">Issues Detected</p>
                      <div className="flex flex-wrap gap-2">
                        {antiPatterns.map((ap, i) => (
                          <span
                            key={i}
                            className={`text-xs font-medium px-2.5 py-1.5 rounded-full border cursor-pointer hover:brightness-125 transition-all ${severityColor(ap.severity)}`}
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
                      <span className="text-sm font-medium">No anti-patterns detected</span>
                    </div>
                  )}

                  {/* Prompt metadata */}
                  <div className="mt-5 pt-4 border-t border-bg-elevated flex gap-4 text-xs text-text-muted">
                    {turn.promptTokensEst !== null && (
                      <span>~{formatTokens(turn.promptTokensEst)} tokens</span>
                    )}
                    {turn.contextUsedPct !== null && (
                      <span>Context window: {Math.round(turn.contextUsedPct)}%</span>
                    )}
                  </div>
                </div>
              )}

              {/* --- Response Tab --- */}
              {activeTab === 'response' && (
                <div>
                  {response ? (
                    <>
                      <div className="bg-bg-primary border border-bg-elevated rounded-lg p-5 mb-5 max-h-[500px] overflow-y-auto scrollbar-thin">
                        <pre className="text-sm text-text-primary/90 whitespace-pre-wrap break-words leading-relaxed">
                          {response.text || 'Empty response'}
                        </pre>
                      </div>

                      {/* Tool calls as styled cards */}
                      {response.toolCalls.length > 0 && (
                        <div className="mb-5">
                          <p className="text-[11px] text-text-muted mb-2.5 uppercase tracking-widest font-semibold">Tool Calls</p>
                          <div className="grid grid-cols-2 gap-2">
                            {response.toolCalls.map((tc, i) => (
                              <div key={i} className="flex items-center gap-2.5 bg-bg-primary border border-bg-elevated rounded-lg px-3.5 py-2.5 hover:border-border-primary transition-colors">
                                <div className="w-7 h-7 rounded-md bg-bg-elevated flex items-center justify-center flex-shrink-0">
                                  <FileCode className="w-3.5 h-3.5 text-purple-400" />
                                </div>
                                <span className="text-xs text-text-secondary font-medium truncate">{tc}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Token usage bar */}
                      <TokenBar usage={response.usage} costUsd={response.costUsd} />
                    </>
                  ) : session.endedAt ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                      <Brain className="w-10 h-10 text-text-muted mb-3" />
                      <p className="text-sm text-text-secondary">No response recorded for this turn</p>
                      <p className="text-xs text-text-muted mt-1">
                        This turn may be a system notification or had no AI response
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                      <div className="relative mb-4">
                        <Brain className="w-12 h-12 text-purple-400 animate-pulse" />
                        <div className="absolute inset-0 rounded-full bg-purple-500/10 animate-ping" style={{ animationDuration: '2s' }} />
                      </div>
                      <p className="text-sm text-text-primary font-medium mb-1.5">AI is generating...</p>
                      <p className="text-xs text-text-muted mb-4">
                        Response will appear here automatically
                      </p>
                      <div className="flex gap-1.5">
                        <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
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
                      {/* Stacked horizontal bar chart */}
                      <div>
                        <p className="text-[11px] text-text-muted mb-3 uppercase tracking-widest font-semibold">Token Distribution</p>
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
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-elevated)" />
                            <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                            <YAxis dataKey="name" type="category" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} width={90} />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: 'var(--bg-card)',
                                border: '1px solid var(--border-primary)',
                                borderRadius: 8,
                                color: 'var(--text-primary)',
                                fontSize: 12,
                              }}
                              labelStyle={{ color: 'var(--text-muted)' }}
                              itemStyle={{ color: 'var(--text-primary)' }}
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

                      {/* Token bar legend */}
                      <TokenBar usage={response.usage} costUsd={response.costUsd} />

                      {/* Cost summary */}
                      <div className="bg-bg-primary border border-bg-elevated rounded-lg p-4">
                        <p className="text-[11px] text-text-muted mb-3 uppercase tracking-widest font-semibold">Cost Summary</p>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs text-text-muted mb-0.5">Model</p>
                            <p className="text-sm text-text-primary font-semibold">{response.usage.model}</p>
                          </div>
                          <div>
                            <p className="text-xs text-text-muted mb-0.5">Turn Cost</p>
                            <p className="text-sm text-text-primary font-semibold">{formatCost(response.costUsd)}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : session.endedAt ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                      <Layers className="w-10 h-10 text-text-muted mb-3" />
                      <p className="text-sm text-text-secondary">No token data available</p>
                      <p className="text-xs text-text-muted mt-1">This turn had no AI response</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                      <Layers className="w-12 h-12 text-purple-400 animate-pulse mb-4" />
                      <p className="text-sm text-text-primary font-medium">Waiting for response...</p>
                      <p className="text-xs text-text-muted mt-1">Token breakdown appears after AI finishes</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: Improvement Coach (45%) */}
          <div className="lg:w-[45%] space-y-5">
            <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2.5">
              <Sparkles className="w-5 h-5 text-purple-400" />
              How to Improve
            </h2>

            {/* Score Breakdown Card */}
            {breakdownData && (
              <div className="bg-bg-card border border-border-primary rounded-lg p-5 hover:border-border-hover transition-colors">
                <div className="flex items-center justify-between mb-5">
                  <p className="text-sm font-semibold text-text-primary uppercase tracking-wider">Score Breakdown</p>
                  <span className="text-2xl font-bold" style={{ color: scoreColor(score) }}>
                    {Math.round(score)}
                  </span>
                </div>
                <div title="How specific is the prompt? Includes file paths, function names, line numbers, exact identifiers.">
                  <DimensionBar label="Specificity" value={breakdownData[0].value} max={25} icon={<Crosshair className="w-3 h-3" />} />
                </div>
                <div title="Does the prompt provide context? Error messages, expected behavior, constraints, prior attempts.">
                  <DimensionBar label="Context" value={breakdownData[1].value} max={25} icon={<Layers className="w-3 h-3" />} />
                </div>
                <div title="Is the prompt clear and focused? Single question, concise language, no ambiguity.">
                  <DimensionBar label="Clarity" value={breakdownData[2].value} max={25} icon={<Eye className="w-3 h-3" />} />
                </div>
                <div title="Does the prompt lead to clear action? Expected output, success criteria, concrete next steps.">
                  <DimensionBar label="Actionability" value={breakdownData[3].value} max={25} icon={<Target className="w-3 h-3" />} />
                </div>
              </div>
            )}

            {/* Issues Found Card */}
            {improvement.issues.length > 0 && (
              <div className="bg-bg-card border border-border-primary rounded-lg p-5 hover:border-border-hover transition-colors">
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-6 h-6 rounded-md bg-red-900/30 flex items-center justify-center">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                  </div>
                  <p className="text-sm font-semibold text-text-primary">Issues Found</p>
                  <span className="text-[11px] font-bold bg-red-900/40 text-red-400 px-2 py-0.5 rounded-full ml-auto">
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
              <div className="bg-bg-card border border-border-primary rounded-lg p-5 hover:border-border-hover transition-colors">
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-6 h-6 rounded-md bg-emerald-900/30 flex items-center justify-center">
                    <Plus className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <p className="text-sm font-semibold text-text-primary">Missing Signals</p>
                  <span className="text-[11px] font-bold bg-emerald-900/40 text-emerald-400 px-2 py-0.5 rounded-full ml-auto">
                    +{improvement.missingSignals.reduce((sum, ms) => {
                      const pts = parseInt(ms.impact.replace(/[^0-9]/g, ''), 10);
                      return sum + (isNaN(pts) ? 0 : pts);
                    }, 0)} pts
                  </span>
                </div>
                <div className="space-y-2">
                  {improvement.missingSignals.map((signal) => (
                    <div
                      key={signal.id}
                      className="bg-bg-primary border border-emerald-900/20 rounded-lg p-3.5 flex items-start justify-between gap-3 hover:border-emerald-800/40 transition-colors"
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="w-5 h-5 rounded-full bg-emerald-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Plus className="w-3 h-3 text-emerald-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-text-primary">{signal.label}</p>
                          <p className="text-xs text-text-muted mt-1 leading-relaxed">{signal.hint}</p>
                        </div>
                      </div>
                      <span className="text-xs text-emerald-400 font-bold whitespace-nowrap bg-emerald-900/20 px-2 py-0.5 rounded-full">{signal.impact}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Suggested Rewrite Card (HERO ELEMENT) */}
            <div className="bg-gradient-to-r from-purple-500 to-blue-500 p-[1px] rounded-lg">
              <div
                className="bg-bg-card rounded-lg p-5 relative overflow-hidden"
                style={{
                  boxShadow: '0 0 30px rgba(139, 92, 246, 0.12), 0 0 60px rgba(139, 92, 246, 0.06)',
                }}
              >
                {/* Subtle gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/[0.03] to-blue-500/[0.03] pointer-events-none" />

                <div className="relative">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-purple-400" />
                      <p className="text-sm font-semibold text-text-primary">Suggested Rewrite</p>
                    </div>
                    <button
                      onClick={() => handleCopy(improvement.rewriteExample)}
                      className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors px-2.5 py-1.5 rounded-md hover:bg-bg-elevated border border-transparent hover:border-border-primary"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>

                  <div className="bg-bg-primary border border-bg-elevated rounded-lg p-4 mb-4">
                    <pre className="text-sm text-text-primary/90 whitespace-pre-wrap break-words font-mono leading-relaxed">
                      {improvement.rewriteExample}
                    </pre>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
                    <span className="flex items-center gap-1.5 font-semibold" style={{ color: scoreColor(rewriteScore) }}>
                      <Zap className="w-3.5 h-3.5" />
                      Estimated score: ~{rewriteScore}/100
                    </span>
                    <span className="text-text-muted">
                      Saves ~{formatTokens(improvement.estimatedTokensSaved)} tokens ({formatCost(improvement.estimatedCostSaved)})
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Pro Tips Card */}
            <div className="bg-bg-card border border-border-primary rounded-lg p-5 hover:border-border-hover transition-colors">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-6 h-6 rounded-md bg-yellow-900/30 flex items-center justify-center">
                  <Lightbulb className="w-3.5 h-3.5 text-yellow-400" />
                </div>
                <p className="text-sm font-semibold text-text-primary">Pro Tips</p>
              </div>
              <div className="space-y-3">
                {proTips.slice(0, 4).map((tip, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <Lightbulb className="w-3.5 h-3.5 text-text-muted mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-text-secondary leading-relaxed">{tip}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* =========== Navigation Footer =========== */}
        <div className="flex items-center justify-between pt-6 border-t border-bg-elevated">
          <button
            onClick={() => router.push(`/sessions/${sessionId}/turns/${turnNumber - 1}`)}
            disabled={turnNumber <= 1}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              turnNumber <= 1
                ? 'text-text-muted cursor-not-allowed'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-card border border-border-primary hover:border-border-hover'
            }`}
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Previous</span>
            <kbd className="hidden sm:inline-block text-[10px] text-text-muted bg-bg-elevated px-1.5 py-0.5 rounded border border-border-primary font-mono">←</kbd>
          </button>

          <div className="flex items-center gap-3">
            <span className="text-xs text-text-muted font-mono">{turnNumber} / {session.totalTurns}</span>
            <button
              onClick={() => router.push(`/sessions/${sessionId}`)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm text-text-muted hover:text-text-primary hover:bg-bg-card border border-bg-elevated hover:border-border-primary transition-all"
            >
              All Turns
            </button>
          </div>

          <button
            onClick={() => router.push(`/sessions/${sessionId}/turns/${turnNumber + 1}`)}
            disabled={turnNumber >= session.totalTurns}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              turnNumber >= session.totalTurns
                ? 'text-text-muted cursor-not-allowed'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-card border border-border-primary hover:border-border-hover'
            }`}
          >
            <span>Next</span>
            <kbd className="hidden sm:inline-block text-[10px] text-text-muted bg-bg-elevated px-1.5 py-0.5 rounded border border-border-primary font-mono">→</kbd>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
