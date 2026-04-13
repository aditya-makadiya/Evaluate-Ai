'use client';

import { DollarSign, Zap, Target, Activity, TrendingUp, TrendingDown } from 'lucide-react';

export interface StatsData {
  cost: number;
  tokens: number;
  avgScore: number;
  sessions: number;
}

interface StatsCardsProps {
  today: StatsData;
  previous: StatsData;
}

function formatCost(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return ((current - previous) / previous) * 100;
}

function pointChange(current: number, previous: number): number {
  return current - previous;
}

interface CardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  iconColor: string;
  trend?: { value: string; positive: boolean } | null;
  delay?: number;
}

function Card({ label, value, icon, iconColor, trend, delay = 0 }: CardProps) {
  return (
    <div
      className="group relative rounded-xl border border-border-primary bg-white/[0.03] backdrop-blur-sm p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-border-hover hover:shadow-lg hover:shadow-black/20"
      style={{ animation: `countUp 0.4s ease-out ${delay}ms both` }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-text-muted">
          {label}
        </span>
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${iconColor}15`, color: iconColor }}
        >
          {icon}
        </div>
      </div>
      <div className="mt-3 text-[28px] font-semibold leading-none tracking-tight text-text-primary">
        {value}
      </div>
      {trend && (
        <div className="mt-2 flex items-center gap-1.5 text-xs">
          {trend.positive ? (
            <TrendingUp className="h-3 w-3 text-emerald-400" />
          ) : (
            <TrendingDown className="h-3 w-3 text-red-400" />
          )}
          <span className={trend.positive ? 'font-medium text-emerald-400' : 'font-medium text-red-400'}>
            {trend.value}
          </span>
          <span className="text-text-muted">vs last week</span>
        </div>
      )}
    </div>
  );
}

export function StatsCards({ today, previous }: StatsCardsProps) {
  const costPct = pctChange(today.cost, previous.cost);
  const tokenPct = pctChange(today.tokens, previous.tokens);
  const scoreDelta = pointChange(today.avgScore, previous.avgScore);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card
        label="Cost"
        value={formatCost(today.cost)}
        icon={<DollarSign className="h-4 w-4" />}
        iconColor="#8b5cf6"
        delay={0}
        trend={
          costPct !== null
            ? {
                value: `${Math.abs(costPct).toFixed(1)}%`,
                positive: costPct <= 0,
              }
            : null
        }
      />
      <Card
        label="Tokens"
        value={formatTokens(today.tokens)}
        icon={<Zap className="h-4 w-4" />}
        iconColor="#3b82f6"
        delay={50}
        trend={
          tokenPct !== null
            ? {
                value: `${Math.abs(tokenPct).toFixed(1)}%`,
                positive: tokenPct <= 0,
              }
            : null
        }
      />
      <Card
        label="Avg Score"
        value={`${Math.round(today.avgScore)}/100`}
        icon={<Target className="h-4 w-4" />}
        iconColor="#22c55e"
        delay={100}
        trend={
          previous.avgScore > 0
            ? {
                value: `${scoreDelta > 0 ? '+' : ''}${scoreDelta.toFixed(1)} pts`,
                positive: scoreDelta >= 0,
              }
            : null
        }
      />
      <Card
        label="Sessions"
        value={String(today.sessions)}
        icon={<Activity className="h-4 w-4" />}
        iconColor="#f97316"
        delay={150}
      />
    </div>
  );
}
