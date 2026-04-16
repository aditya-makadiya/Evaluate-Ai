'use client';

import type { ReactNode } from 'react';

interface AdminChartCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
}

export function AdminChartCard({ title, subtitle, children, action }: AdminChartCardProps) {
  return (
    <div className="rounded-xl border border-border-primary bg-bg-card p-5 transition-colors hover:border-border-hover">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          {subtitle && (
            <p className="mt-0.5 text-xs text-text-muted">{subtitle}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}
