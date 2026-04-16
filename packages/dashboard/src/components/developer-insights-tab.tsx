'use client';

import {
  Lightbulb,
  TrendingUp,
  TrendingDown,
  DollarSign,
  AlertTriangle,
  Info,
  GraduationCap,
  ChevronRight,
} from 'lucide-react';

interface CoachingTip {
  pattern: string;
  count: number;
  label: string;
  tip: string;
  severity: 'high' | 'medium' | 'low';
}

interface DeveloperInsightsTabProps {
  insights: string[];
  coachingTips: CoachingTip[];
}

function getInsightIcon(insight: string) {
  if (insight.includes('save') || insight.includes('cost') || insight.includes('$')) return DollarSign;
  if (insight.includes('improved') || insight.includes('best')) return TrendingUp;
  if (insight.includes('declined') || insight.includes('coaching')) return TrendingDown;
  if (insight.includes('unplanned') || insight.includes('re-alignment')) return AlertTriangle;
  return Info;
}

function getInsightColor(insight: string): string {
  if (insight.includes('improved') || insight.includes('best')) return 'border-emerald-800/50 bg-emerald-950/20';
  if (insight.includes('declined') || insight.includes('coaching') || insight.includes('unplanned')) return 'border-yellow-800/50 bg-yellow-950/20';
  if (insight.includes('save') || insight.includes('switching')) return 'border-blue-800/50 bg-blue-950/20';
  return 'border-border-primary bg-bg-card';
}

function getSeverityStyle(severity: 'high' | 'medium' | 'low') {
  switch (severity) {
    case 'high': return { border: 'border-red-800/50', bg: 'bg-red-950/20', badge: 'bg-red-900/30 text-red-400', dot: 'bg-red-400' };
    case 'medium': return { border: 'border-yellow-800/50', bg: 'bg-yellow-950/20', badge: 'bg-yellow-900/30 text-yellow-400', dot: 'bg-yellow-400' };
    case 'low': return { border: 'border-blue-800/50', bg: 'bg-blue-950/20', badge: 'bg-blue-900/30 text-blue-400', dot: 'bg-blue-400' };
  }
}

export default function DeveloperInsightsTab({ insights, coachingTips }: DeveloperInsightsTabProps) {
  return (
    <div className="space-y-6">
      {/* Coaching Tips */}
      {coachingTips.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <GraduationCap className="h-5 w-5 text-purple-400" />
            <h3 className="text-lg font-semibold text-text-primary">Coaching Tips</h3>
            <span className="text-xs text-text-muted ml-auto">Based on your most common anti-patterns</span>
          </div>

          <div className="space-y-3">
            {coachingTips.map((tip) => {
              const style = getSeverityStyle(tip.severity);
              return (
                <div
                  key={tip.pattern}
                  className={`rounded-lg border p-4 ${style.border} ${style.bg}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${style.dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-sm font-semibold text-text-primary">{tip.label}</span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${style.badge}`}>
                          {tip.count}x this month
                        </span>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${style.badge}`}>
                          {tip.severity}
                        </span>
                      </div>
                      <p className="text-sm text-text-secondary leading-relaxed">{tip.tip}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-text-muted shrink-0 mt-1" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Auto-generated Insights */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Lightbulb className="h-5 w-5 text-yellow-400" />
          <h3 className="text-lg font-semibold text-text-primary">Auto-Generated Insights</h3>
        </div>

        {insights.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center bg-bg-card border border-border-primary rounded-lg">
            <Lightbulb className="w-10 h-10 text-text-muted mb-3" />
            <p className="text-sm text-text-secondary">No insights available yet</p>
            <p className="text-xs text-text-muted mt-1">Insights are generated from a week of activity data.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {insights.map((insight, i) => {
              const Icon = getInsightIcon(insight);
              const colorClass = getInsightColor(insight);
              return (
                <div
                  key={i}
                  className={`flex items-start gap-3 rounded-lg border p-4 ${colorClass}`}
                >
                  <Icon className="h-5 w-5 shrink-0 mt-0.5 text-text-secondary" />
                  <p className="text-sm text-text-primary">{insight}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
