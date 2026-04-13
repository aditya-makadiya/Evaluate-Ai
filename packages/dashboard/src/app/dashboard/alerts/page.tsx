'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/components/auth-provider';
import {
  AlertTriangle,
  AlertCircle,
  Trophy,
  Clock,
  DollarSign,
  UserX,
  Target,
  Check,
  X,
  CheckCircle2,
} from 'lucide-react';

interface AlertItem {
  id: string;
  teamId: string;
  type: string;
  severity: string;
  title: string;
  description: string | null;
  developerId: string | null;
  developerName: string | null;
  taskId: string | null;
  isRead: boolean;
  isDismissed: boolean;
  createdAt: string;
}

type FilterType = 'all' | 'critical' | 'warning' | 'info' | 'positive';

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'border-l-red-500 bg-red-950/10',
  warning: 'border-l-yellow-500 bg-yellow-950/10',
  info: 'border-l-blue-500 bg-blue-950/10',
  positive: 'border-l-emerald-500 bg-emerald-950/10',
};

const SEVERITY_ICON_COLORS: Record<string, string> = {
  critical: 'text-red-400',
  warning: 'text-yellow-400',
  info: 'text-blue-400',
  positive: 'text-emerald-400',
};

const TYPE_ICONS: Record<string, typeof AlertTriangle> = {
  task_stale: Clock,
  high_ai_cost: DollarSign,
  low_prompt_score: Target,
  sprint_risk: AlertTriangle,
  inactive_developer: UserX,
  high_performer: Trophy,
};

const FILTER_PILLS: { key: FilterType; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'critical', label: 'Critical' },
  { key: 'warning', label: 'Warning' },
  { key: 'info', label: 'Info' },
  { key: 'positive', label: 'Positive' },
];

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`shimmer rounded-lg ${className}`} />;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4, 5].map(i => (
        <Skeleton key={i} className="h-24" />
      ))}
    </div>
  );
}

export default function AlertsPage() {
  const { user: authUser } = useAuth();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');

  const fetchAlerts = useCallback(() => {
    if (!authUser) return;
    fetch('/api/alerts?limit=50')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(json => {
        setAlerts(json.alerts ?? []);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [authUser]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const handleAction = async (alertId: string, action: 'read' | 'dismiss') => {
    try {
      const res = await fetch('/api/alerts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertId, action }),
      });
      if (res.ok) {
        setAlerts(prev =>
          prev.map(a => {
            if (a.id !== alertId) return a;
            if (action === 'read') return { ...a, isRead: true };
            return { ...a, isDismissed: true };
          }).filter(a => !a.isDismissed)
        );
      }
    } catch {
      // Silently handle — alert stays in original state
    }
  };

  const filtered = filter === 'all'
    ? alerts
    : alerts.filter(a => a.severity === filter);

  const unreadCount = alerts.filter(a => !a.isRead).length;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="mb-8 animate-section">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            Alerts
          </h1>
          {unreadCount > 0 && (
            <span className="flex items-center justify-center h-6 min-w-[24px] px-2 rounded-full bg-red-600 text-white text-xs font-bold">
              {unreadCount}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-text-muted">
          Automated alerts for your team
        </p>
      </header>

      {/* Filter pills */}
      <div className="animate-section mb-6 flex flex-wrap gap-2">
        {FILTER_PILLS.map(pill => {
          const isActive = filter === pill.key;
          const baseClass = 'px-4 py-1.5 rounded-full text-sm font-medium transition-colors cursor-pointer';
          const activeClass = isActive
            ? 'bg-purple-600 text-white'
            : 'bg-bg-card border border-border-primary text-text-secondary hover:bg-bg-elevated hover:text-text-primary';
          return (
            <button
              key={pill.key}
              className={`${baseClass} ${activeClass}`}
              onClick={() => setFilter(pill.key)}
            >
              {pill.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {loading && <LoadingSkeleton />}

      {error && (
        <div className="animate-section rounded-lg border border-red-900/50 bg-red-950/20 p-5 text-sm text-red-400">
          <span className="font-medium">Failed to load alerts:</span> {error}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="animate-section flex flex-col items-center justify-center py-16 text-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-400 mb-3" />
          <p className="text-sm text-text-secondary">
            No alerts — your team is on track!
          </p>
          <p className="text-xs text-text-muted mt-1">
            Alerts are generated daily by the cron system
          </p>
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="animate-section space-y-3">
          {filtered.map(alert => {
            const Icon = TYPE_ICONS[alert.type] ?? AlertCircle;
            const severityStyle = SEVERITY_STYLES[alert.severity] ?? SEVERITY_STYLES.info;
            const iconColor = SEVERITY_ICON_COLORS[alert.severity] ?? 'text-blue-400';
            const cardOpacity = alert.isRead ? 'opacity-60' : '';

            return (
              <div
                key={alert.id}
                className={`border border-border-primary border-l-4 rounded-lg p-4 hover:border-border-hover transition-colors ${severityStyle} ${cardOpacity}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 shrink-0 ${iconColor}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-text-primary">
                      {alert.title}
                    </p>
                    {alert.description && (
                      <p className="text-xs text-text-secondary mt-1">
                        {alert.description}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-2">
                      {alert.developerName && (
                        <span className="text-xs text-text-muted">
                          {alert.developerName}
                        </span>
                      )}
                      <span className="text-xs text-text-muted">
                        {timeAgo(alert.createdAt)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!alert.isRead && (
                      <button
                        onClick={() => handleAction(alert.id, 'read')}
                        className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors"
                        title="Mark as read"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={() => handleAction(alert.id, 'dismiss')}
                      className="p-1.5 rounded-md text-text-muted hover:text-red-400 hover:bg-bg-elevated transition-colors"
                      title="Dismiss"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
