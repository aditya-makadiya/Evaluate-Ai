'use client';

import { useEffect, useState } from 'react';
import { Github, Mic, Check, Clock, UserX, AlertCircle } from 'lucide-react';
import { formatTimeAgo } from '@/lib/integrations/time-ago';

interface V2Member {
  userId: string;
  name: string | null;
  email: string | null;
  role: string | null;
  externalAccountHandle: string | null;
  status: string;
  lastSyncAt: string | null;
  tokenExpiresAt: string | null;
  accessibleRepoCount: number;
}

interface V2ProviderSummary {
  provider: 'github' | 'fireflies';
  connectedCount: number;
  totalMemberCount: number;
  members: V2Member[];
}

interface StatusResponseV2 {
  flow: 'v2';
  providers: Record<'github' | 'fireflies', V2ProviderSummary>;
}

export interface TeamCoverageRosterProps {
  teamId: string;
  /** Current user's role — controls whether the "Revoke" button renders. */
  canManage: boolean;
  /** Current user's id — so their own row gets a "(you)" tag. */
  currentUserId: string;
  /** Called after a successful revoke so the parent can refresh related UI. */
  onAfterRevoke?: () => void;
}

const providerMeta = {
  github: { label: 'GitHub', Icon: Github },
  fireflies: { label: 'Fireflies', Icon: Mic },
} as const;

/**
 * Manager-facing coverage view: per-provider list of team members with
 * connection status, handle, repo count, and last-sync badge. Managers can
 * revoke anyone; developers see the roster read-only.
 *
 * Styled to match IntegrationCard — dark theme via CSS variable tokens
 * (bg-bg-card / text-text-primary / border-border-primary / purple & emerald
 * accents at low opacity).
 */
export function TeamCoverageRoster({
  teamId,
  canManage,
  currentUserId,
  onAfterRevoke,
}: TeamCoverageRosterProps) {
  const [data, setData] = useState<StatusResponseV2 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/integrations/status?team_id=${teamId}`);
        if (!res.ok) {
          setError('Failed to load coverage');
          return;
        }
        const payload = await res.json();
        if (payload.flow !== 'v2') return;
        if (!cancelled) setData(payload as StatusResponseV2);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'unknown');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  async function handleRevoke(userId: string, provider: 'github' | 'fireflies') {
    setRevoking(`${userId}:${provider}`);
    try {
      const res = await fetch('/api/integrations/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_id: teamId, provider, target_user_id: userId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'Failed to revoke');
      } else {
        const statusRes = await fetch(`/api/integrations/status?team_id=${teamId}`);
        if (statusRes.ok) setData(await statusRes.json());
        onAfterRevoke?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown');
    } finally {
      setRevoking(null);
    }
  }

  if (loading) {
    return (
      <div className="bg-bg-card border border-border-primary rounded-lg p-5">
        <div className="text-sm text-text-muted">Loading team coverage…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-bg-card border border-red-800/50 rounded-lg p-4 flex items-start gap-2 text-sm">
        <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
        <span className="text-red-300">{error}</span>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      {(Object.keys(data.providers) as Array<keyof typeof providerMeta>).map((slug) => {
        const summary = data.providers[slug];
        const { Icon, label } = providerMeta[slug];
        const coverage =
          summary.totalMemberCount > 0
            ? Math.round((summary.connectedCount / summary.totalMemberCount) * 100)
            : 0;
        return (
          <div
            key={slug}
            className="bg-bg-card border border-border-primary rounded-lg overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border-primary">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-900/20 text-purple-400">
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-text-primary">{label}</div>
                  <div className="text-xs text-text-muted mt-0.5">
                    {summary.connectedCount} of {summary.totalMemberCount} members connected
                  </div>
                </div>
              </div>
              {/* Coverage meter */}
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-24 bg-bg-elevated rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500 transition-all duration-500"
                    style={{ width: `${coverage}%` }}
                  />
                </div>
                <span className="text-[11px] font-medium text-text-secondary tabular-nums w-8 text-right">
                  {coverage}%
                </span>
              </div>
            </div>

            {/* Body */}
            {summary.members.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <div className="text-sm text-text-muted">
                  No one has connected {label} yet.
                </div>
                <div className="text-xs text-text-muted mt-1 opacity-75">
                  Members connect their own accounts at the top of this page.
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-border-primary">
                {summary.members.map((m) => {
                  const isSelf = m.userId === currentUserId;
                  const revokingThis = revoking === `${m.userId}:${slug}`;
                  return (
                    <li
                      key={m.userId}
                      className="flex items-center justify-between px-5 py-3 text-sm"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <StatusDot status={m.status} />
                        <div className="min-w-0">
                          <div className="font-medium text-text-primary truncate">
                            {m.name ?? m.email ?? m.userId}
                            {isSelf && (
                              <span className="ml-2 text-xs font-normal text-text-muted">
                                (you)
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-text-muted truncate">
                            {m.externalAccountHandle
                              ? `@${m.externalAccountHandle}`
                              : m.status === 'active'
                                ? 'connected'
                                : 'not connected'}
                            {m.accessibleRepoCount > 0 && slug === 'github' && (
                              <span> · {m.accessibleRepoCount} repos</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <StatusBadge status={m.status} lastSyncAt={m.lastSyncAt} />
                        {canManage && m.status !== 'revoked' && (
                          <button
                            className="text-xs text-text-muted hover:text-red-400 disabled:opacity-50 transition-colors"
                            onClick={() => handleRevoke(m.userId, slug)}
                            disabled={revokingThis}
                          >
                            {revokingThis ? 'Revoking…' : isSelf ? 'Disconnect' : 'Revoke'}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'active'
      ? 'bg-emerald-400'
      : status === 'expired'
        ? 'bg-amber-400'
        : status === 'error'
          ? 'bg-red-400'
          : 'bg-text-muted';
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${color} ${status === 'active' ? 'animate-pulse' : ''}`}
      aria-label={status}
    />
  );
}

function StatusBadge({
  status,
  lastSyncAt,
}: {
  status: string;
  lastSyncAt: string | null;
}) {
  if (status === 'expired') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-400 bg-amber-900/20 border border-amber-800/40 px-2 py-0.5 rounded-full">
        <Clock className="h-3 w-3" /> expired
      </span>
    );
  }
  if (status === 'revoked') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-text-muted bg-bg-elevated border border-border-primary px-2 py-0.5 rounded-full">
        <UserX className="h-3 w-3" /> revoked
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-400 bg-red-900/20 border border-red-800/40 px-2 py-0.5 rounded-full">
        <AlertCircle className="h-3 w-3" /> error
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-900/25 border border-emerald-800/40 px-2 py-0.5 rounded-full">
      <Check className="h-3 w-3" />
      synced {formatTimeAgo(lastSyncAt)}
    </span>
  );
}
