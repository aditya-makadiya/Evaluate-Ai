'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';

interface ScoreTrendProps {
  data: { date: string; score: number }[];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function scoreColorForValue(score: number): string {
  if (score >= 80) return '#22c55e';
  if (score >= 60) return '#3b82f6';
  if (score >= 40) return '#eab308';
  return '#ef4444';
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const score = Math.round(payload[0].value);
  const color = scoreColorForValue(score);
  return (
    <div className="rounded-lg border border-border-primary bg-bg-elevated px-3 py-2 text-sm shadow-xl shadow-black/30">
      <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
        {formatDate(label ?? '')}
      </p>
      <p className="mt-0.5 text-base font-semibold" style={{ color }}>
        {score}/100
      </p>
    </div>
  );
}

export function ScoreTrend({ data }: ScoreTrendProps) {
  if (data.length === 0) {
    return (
      <div className="card">
        <h3 className="mb-4 text-sm font-medium text-text-primary">Score Trend</h3>
        <p className="text-sm text-text-muted">No score data yet.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-text-primary">Score Trend</h3>
          <p className="mt-0.5 text-xs text-text-muted">Last 30 days</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-text-muted">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-[#22c55e]" />
            Score
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-[1px] w-3 border-t border-dashed border-text-muted" />
            Good (70)
          </span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
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
            domain={[0, 100]}
            stroke="var(--text-muted)"
            tick={{ fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={30}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--border-hover)', strokeDasharray: '4 4' }} />
          <ReferenceLine
            y={70}
            stroke="var(--text-muted)"
            strokeDasharray="6 4"
            strokeOpacity={0.5}
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke="#22c55e"
            strokeWidth={2}
            dot={false}
            activeDot={{
              r: 4,
              fill: '#22c55e',
              stroke: 'var(--bg-card)',
              strokeWidth: 2,
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
