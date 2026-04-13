'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface ModelDonutProps {
  data: { model: string; count: number; cost: number }[];
}

const MODEL_COLORS: Record<string, string> = {
  sonnet: '#3b82f6',
  haiku: '#06b6d4',
  opus: '#8b5cf6',
  gpt: '#f97316',
  gemini: '#22c55e',
  claude: '#ec4899',
};

function getColor(model: string, index: number): string {
  const lower = model.toLowerCase();
  for (const [key, color] of Object.entries(MODEL_COLORS)) {
    if (lower.includes(key)) return color;
  }
  const fallback = ['#8b5cf6', '#3b82f6', '#22c55e', '#f97316', '#06b6d4', '#ec4899'];
  return fallback[index % fallback.length];
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { payload: { model: string; count: number; pct: number; cost: number } }[] }) {
  if (!active || !payload?.length) return null;
  const entry = payload[0].payload;
  return (
    <div className="rounded-lg border border-border-primary bg-bg-elevated px-3 py-2 text-sm shadow-xl shadow-black/30">
      <p className="font-medium text-text-primary">{entry.model}</p>
      <div className="mt-1 flex items-center gap-3 text-xs text-text-muted">
        <span>{entry.count} sessions</span>
        <span>${entry.cost.toFixed(2)}</span>
      </div>
    </div>
  );
}

export function ModelDonut({ data }: ModelDonutProps) {
  const totalCount = data.reduce((sum, d) => sum + d.count, 0);
  const chartData = data.map((d, i) => ({
    ...d,
    percent: totalCount > 0 ? d.count / totalCount : 0,
    color: getColor(d.model, i),
  }));

  return (
    <div className="card">
      <h3 className="mb-4 text-sm font-medium text-text-primary">Model Usage</h3>
      {data.length === 0 ? (
        <div className="flex flex-col items-center py-8 text-center">
          <p className="text-sm text-text-muted">No model data yet.</p>
        </div>
      ) : (
        <div className="flex items-center gap-6">
          <div className="flex-1">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  dataKey="count"
                  nameKey="model"
                  stroke="var(--bg-card)"
                  strokeWidth={3}
                  paddingAngle={2}
                >
                  {chartData.map((entry) => (
                    <Cell key={entry.model} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Legend */}
          <div className="shrink-0 space-y-2.5 pr-2">
            {chartData.map((entry) => (
              <div key={entry.model} className="flex items-center gap-2.5">
                <span
                  className="h-2.5 w-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: entry.color }}
                />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-text-primary truncate max-w-[120px]">
                    {entry.model}
                  </p>
                  <p className="text-[10px] text-text-muted">
                    {(entry.percent * 100).toFixed(0)}% &middot; ${entry.cost.toFixed(2)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
