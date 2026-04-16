'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/components/auth-provider';
import { Lightbulb, RefreshCw, TrendingDown, RotateCcw } from 'lucide-react';
import AntiPatternChart from '@/components/insights/anti-pattern-chart';
import ToolUsageTable from '@/components/insights/tool-usage-table';

interface InsightsData {
  days: number;
  antiPatterns: { pattern: string; count: number; developers: number }[];
  toolUsage: { name: string; count: number; avgExecMs: number | null; successRate: number | null; developers: number }[];
  retryRate: number;
  retryRates: { developerId: string; developerName: string; retries: number; total: number; rate: number }[];
  totalTurns: number;
}

const DAY_OPTIONS = [7, 14, 30];

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`shimmer rounded-lg ${className}`} />;
}

export default function InsightsPage() {
  const { user: authUser } = useAuth();
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(7);

  useEffect(() => {
    if (!authUser) return;
    setLoading(true);
    fetch(`/api/dashboard/insights?days=${days}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => { setData(json); setError(null); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [authUser, days]);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 animate-section">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary flex items-center gap-2">
            <Lightbulb className="h-6 w-6 text-purple-400" />
            Team Insights
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Anti-pattern trends, tool usage, and prompt quality patterns
          </p>
        </div>
        <div className="flex items-center gap-2">
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                days === d
                  ? 'bg-purple-600 text-white'
                  : 'border border-border-primary bg-bg-card text-text-secondary hover:bg-bg-elevated'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="animate-section rounded-lg border border-red-900/50 bg-red-950/20 p-5 text-sm text-red-400 mb-6">
          Failed to load insights: {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-[400px]" />
          <Skeleton className="h-[400px]" />
          <Skeleton className="h-[200px] lg:col-span-2" />
        </div>
      )}

      {/* Content */}
      {!loading && !error && data && (
        <div className="space-y-6">
          {/* Stats row */}
          <div className="grid grid-cols-1 gap-4 animate-section max-w-xs">
            <div className="bg-bg-card border border-border-primary rounded-lg p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-1">Retry Rate</p>
              <p className={`text-2xl font-bold font-mono ${
                data.retryRate <= 5 ? 'text-emerald-400' :
                data.retryRate <= 15 ? 'text-yellow-400' :
                'text-red-400'
              }`}>
                {data.retryRate}%
              </p>
            </div>
          </div>

          {/* Two-column layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-section">
            {/* Anti-patterns */}
            <div className="bg-bg-card border border-border-primary rounded-lg p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingDown className="h-4 w-4 text-purple-400" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">
                  Top Anti-patterns ({days}d)
                </h2>
              </div>
              <AntiPatternChart patterns={data.antiPatterns} />
            </div>

            {/* Tool usage */}
            <div className="bg-bg-card border border-border-primary rounded-lg p-5">
              <div className="flex items-center gap-2 mb-4">
                <RefreshCw className="h-4 w-4 text-purple-400" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">
                  Tool Usage ({days}d)
                </h2>
              </div>
              <ToolUsageTable tools={data.toolUsage} />
            </div>
          </div>

          {/* Retry rates by developer */}
          {data.retryRates.length > 0 && (
            <div className="bg-bg-card border border-border-primary rounded-lg p-5 animate-section">
              <div className="flex items-center gap-2 mb-4">
                <RotateCcw className="h-4 w-4 text-purple-400" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">
                  Retry Rate by Developer
                </h2>
              </div>
              <div className="space-y-2">
                {data.retryRates.map((dev) => (
                  <div key={dev.developerId} className="flex items-center justify-between">
                    <span className="text-sm text-text-secondary">{dev.developerName}</span>
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-text-muted">
                        {dev.retries}/{dev.total} prompts
                      </span>
                      <span className={`text-sm font-mono font-medium ${
                        dev.rate <= 5 ? 'text-emerald-400' :
                        dev.rate <= 15 ? 'text-yellow-400' :
                        'text-red-400'
                      }`}>
                        {dev.rate}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
