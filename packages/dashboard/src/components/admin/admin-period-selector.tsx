'use client';

export type AdminPeriod = 'week' | 'month' | 'quarter';

interface AdminPeriodSelectorProps {
  value: AdminPeriod;
  onChange: (period: AdminPeriod) => void;
}

const PERIODS: { value: AdminPeriod; label: string }[] = [
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'quarter', label: 'This Quarter' },
];

export function AdminPeriodSelector({ value, onChange }: AdminPeriodSelectorProps) {
  return (
    <div className="inline-flex rounded-lg border border-border-primary bg-bg-card p-0.5">
      {PERIODS.map((period) => (
        <button
          key={period.value}
          onClick={() => onChange(period.value)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
            value === period.value
              ? 'bg-purple-600 text-white shadow-sm'
              : 'text-text-muted hover:text-text-primary'
          }`}
        >
          {period.label}
        </button>
      ))}
    </div>
  );
}
