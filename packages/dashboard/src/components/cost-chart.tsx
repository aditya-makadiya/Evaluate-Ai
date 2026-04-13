'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface CostChartProps {
  data: { date: string; cost: number }[];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border-primary bg-bg-elevated px-3 py-2 text-sm shadow-xl shadow-black/30">
      <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
        {formatDate(label ?? '')}
      </p>
      <p className="mt-0.5 text-base font-semibold text-text-primary">
        ${payload[0].value.toFixed(2)}
      </p>
    </div>
  );
}

export function CostChart({ data }: CostChartProps) {
  if (data.length === 0) {
    return (
      <div className="card">
        <h3 className="mb-4 text-sm font-medium text-text-primary">Daily Cost</h3>
        <p className="text-sm text-text-muted">No cost data yet.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-text-primary">Daily Cost</h3>
          <p className="mt-0.5 text-xs text-text-muted">Last 30 days</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <span className="inline-block h-2 w-2 rounded-full bg-[#8b5cf6]" />
          Cost
        </div>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="costGradientFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.25} />
              <stop offset="50%" stopColor="#8b5cf6" stopOpacity={0.08} />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border-primary)"
            horizontal={true}
            vertical={false}
          />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            stroke="var(--text-muted)"
            tick={{ fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            stroke="var(--text-muted)"
            tick={{ fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `$${v}`}
            width={45}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--border-hover)', strokeDasharray: '4 4' }} />
          <Area
            type="monotone"
            dataKey="cost"
            stroke="#8b5cf6"
            strokeWidth={2}
            fill="url(#costGradientFill)"
            dot={false}
            activeDot={{
              r: 4,
              fill: '#8b5cf6',
              stroke: 'var(--bg-card)',
              strokeWidth: 2,
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
