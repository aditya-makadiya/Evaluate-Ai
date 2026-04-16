'use client';

import { TrendingUp, TrendingDown } from 'lucide-react';
import type { ReactNode } from 'react';

interface AdminStatCardProps {
  label: string;
  value: string;
  icon: ReactNode;
  iconColor: string;
  trend?: { value: string; positive: boolean } | null;
  subtitle?: string;
  delay?: number;
}

export function AdminStatCard({
  label,
  value,
  icon,
  iconColor,
  trend,
  subtitle,
  delay = 0,
}: AdminStatCardProps) {
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
          {subtitle && <span className="text-text-muted">{subtitle}</span>}
        </div>
      )}
    </div>
  );
}
