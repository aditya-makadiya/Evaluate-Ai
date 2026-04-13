'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import {
  Github,
  Mic,
  Trello,
  MessageSquare,
  Check,
  ExternalLink,
  Plug,
  Loader2,
  AlertCircle,
  Key,
  X,
  RefreshCw,
  Unplug,
} from 'lucide-react';

// ---------- Types ----------

interface Repo {
  name: string;
  fullName: string;
  defaultBranch: string;
  language: string | null;
  private: boolean;
}

interface Integration {
  id: string;
  provider: string;
  status: string;
  config: {
    repos?: Array<{
      name: string;
      full_name: string;
      default_branch: string;
      language: string | null;
    }>;
    connected_at?: string;
    tracked_repos?: string[];
  };
  lastSyncAt: string | null;
}

// ---------- Constants ----------

const integrationCards = [
  {
    id: 'github',
    name: 'GitHub',
    description: 'Track commits, pull requests, and code reviews',
    icon: Github,
    available: true,
  },
  {
    id: 'fireflies',
    name: 'Fireflies.ai',
    description: 'Auto-capture meeting transcripts and action items',
    icon: Mic,
    available: true,
  },
  {
    id: 'jira',
    name: 'Jira',
    description: 'Sync tasks, sprints, and project tracking',
    icon: Trello,
    available: false,
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Daily digests, alerts, and team notifications',
    icon: MessageSquare,
    available: false,
  },
];

// ---------- Component ----------

export default function IntegrationsPageWrapper() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin h-8 w-8 border-2 border-purple-500 border-t-transparent rounded-full" /></div>}>
      <IntegrationsPage />
    </Suspense>
  );
}

function IntegrationsPage() {
  const searchParams = useSearchParams();
  const { user: authUser } = useAuth();
  const teamId = authUser?.teamId ?? '';

  const [githubIntegration, setGithubIntegration] = useState<Integration | null>(null);
  const [firefliesIntegration, setFirefliesIntegration] = useState<Integration | null>(null);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showFirefliesModal, setShowFirefliesModal] = useState(false);
  const [firefliesApiKey, setFirefliesApiKey] = useState('');
  const [firefliesConnecting, setFirefliesConnecting] = useState(false);
  const [firefliesSyncing, setFirefliesSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [githubSyncing, setGithubSyncing] = useState(false);
  const [githubLastSyncAt, setGithubLastSyncAt] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState<string | null>(null);

  // Check URL params for success/error messages
  useEffect(() => {
    const success = searchParams.get('success');
    const error = searchParams.get('error');

    if (success === 'github_connected') {
      setSuccessMsg('GitHub connected successfully!');
      setTimeout(() => setSuccessMsg(null), 5000);
    }
    if (error) {
      const errorMessages: Record<string, string> = {
        missing_params: 'GitHub authorization failed: missing parameters',
        invalid_state: 'GitHub authorization failed: invalid state',
        oauth_failed: 'GitHub OAuth failed. Please try again.',
        callback_failed: 'GitHub connection failed. Please try again.',
      };
      setErrorMsg(errorMessages[error] ?? 'An error occurred');
      setTimeout(() => setErrorMsg(null), 5000);
    }
  }, [searchParams]);

  // Fetch integration statuses
  useEffect(() => {
    if (!teamId) {
      setLoading(false);
      return;
    }

    async function fetchIntegrations() {
      try {
        // Fetch GitHub integration repos
        const ghReposRes = await fetch(`/api/integrations/github/repos?team_id=${teamId}`);
        if (ghReposRes.ok) {
          const data = await ghReposRes.json();
          setRepos(data.repos ?? []);
          setGithubIntegration({
            id: 'github',
            provider: 'github',
            status: 'active',
            config: {},
            lastSyncAt: null,
          });
        }

        // Fetch Fireflies integration status
        const ffRes = await fetch(`/api/integrations/fireflies/status?team_id=${teamId}`);
        if (ffRes.ok) {
          const data = await ffRes.json();
          if (data.connected) {
            setFirefliesIntegration({
              id: 'fireflies',
              provider: 'fireflies',
              status: 'active',
              config: {
                connected_at: data.connectedAt,
              },
              lastSyncAt: data.lastSyncAt,
            });
            setLastSyncAt(data.lastSyncAt ?? null);
          }
        }
      } catch {
        // Not connected — that's fine
      } finally {
        setLoading(false);
      }
    }

    fetchIntegrations();
  }, [teamId]);

  function handleConnectGitHub() {
    window.location.href = `/api/integrations/github/connect?team_id=${teamId}`;
  }

  async function handleDisconnect(provider: string) {
    setConfirmDisconnect(null);
    setDisconnecting(provider);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/integrations/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_id: teamId, provider }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error ?? 'Failed to disconnect');
        return;
      }

      if (provider === 'github') {
        setGithubIntegration(null);
        setRepos([]);
      } else if (provider === 'fireflies') {
        setFirefliesIntegration(null);
        setLastSyncAt(null);
      }

      setSuccessMsg(`${provider === 'github' ? 'GitHub' : 'Fireflies.ai'} disconnected successfully.`);
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch {
      setErrorMsg('Failed to disconnect. Please try again.');
    } finally {
      setDisconnecting(null);
    }
  }

  async function handleGithubSync() {
    setGithubSyncing(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/integrations/github/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_id: teamId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error ?? 'GitHub sync failed');
        return;
      }

      setGithubLastSyncAt(data.syncedAt);

      const parts: string[] = [];
      if (data.commitsProcessed > 0) parts.push(`${data.commitsProcessed} commit${data.commitsProcessed !== 1 ? 's' : ''}`);
      if (data.prsProcessed > 0) parts.push(`${data.prsProcessed} PR${data.prsProcessed !== 1 ? 's' : ''}`);

      if (parts.length > 0) {
        setSuccessMsg(`Synced ${parts.join(' and ')} from ${data.reposSynced} repo${data.reposSynced !== 1 ? 's' : ''}.`);
      } else {
        setSuccessMsg('All data already synced. No new commits or PRs found.');
      }
      setTimeout(() => setSuccessMsg(null), 7000);
    } catch {
      setErrorMsg('Failed to sync GitHub data. Please try again.');
    } finally {
      setGithubSyncing(false);
    }
  }

  function handleConnectFireflies() {
    setShowFirefliesModal(true);
    setFirefliesApiKey('');
  }

  async function handleSaveFirefliesKey() {
    if (!firefliesApiKey.trim()) {
      setErrorMsg('Please enter your Fireflies API key');
      return;
    }

    setFirefliesConnecting(true);
    try {
      const res = await fetch('/api/integrations/fireflies/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_id: teamId, api_key: firefliesApiKey.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error ?? 'Failed to connect Fireflies');
        return;
      }

      setFirefliesIntegration({
        id: 'fireflies',
        provider: 'fireflies',
        status: 'active',
        config: { connected_at: new Date().toISOString() },
        lastSyncAt: new Date().toISOString(),
      });
      setShowFirefliesModal(false);
      setFirefliesApiKey('');
      setSuccessMsg(
        data.accountName
          ? `Fireflies connected as ${data.accountName}! Configure the webhook to start capturing meetings.`
          : 'Fireflies connected! Configure the webhook to start capturing meetings.'
      );
      setTimeout(() => setSuccessMsg(null), 7000);
    } catch {
      setErrorMsg('Failed to connect Fireflies. Please try again.');
    } finally {
      setFirefliesConnecting(false);
    }
  }

  async function handleFirefliesSync() {
    setFirefliesSyncing(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/integrations/fireflies/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_id: teamId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error ?? 'Sync failed');
        return;
      }

      setLastSyncAt(data.syncedAt);

      if (data.meetingsProcessed > 0) {
        setSuccessMsg(
          `Synced ${data.meetingsProcessed} new meeting${data.meetingsProcessed !== 1 ? 's' : ''}` +
          (data.tasksExtracted > 0 ? ` with ${data.tasksExtracted} action item${data.tasksExtracted !== 1 ? 's' : ''} extracted` : '') +
          `. ${data.meetingsSkipped > 0 ? `${data.meetingsSkipped} already synced.` : ''}`
        );
      } else if (data.meetingsFound === 0) {
        setSuccessMsg('No new meetings found since last sync.');
      } else {
        setSuccessMsg(`All ${data.meetingsSkipped} meeting${data.meetingsSkipped !== 1 ? 's' : ''} already synced.`);
      }
      setTimeout(() => setSuccessMsg(null), 7000);
    } catch {
      setErrorMsg('Failed to sync meetings. Please try again.');
    } finally {
      setFirefliesSyncing(false);
    }
  }

  const isGitHubConnected = githubIntegration !== null;
  const isFirefliesConnected = firefliesIntegration !== null;

  // ---------- Render ----------

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          Integrations
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Connect your tools to track developer activity automatically
        </p>
      </div>

      {/* Success/Error Messages */}
      {successMsg && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-emerald-800/50 bg-emerald-900/20 px-4 py-3 text-sm text-emerald-300">
          <Check className="h-4 w-4 shrink-0" />
          {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-900/20 px-4 py-3 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {errorMsg}
        </div>
      )}

      {/* Fireflies API Key Modal */}
      {showFirefliesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-bg-card border border-border-primary rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-text-primary">
                Connect Fireflies.ai
              </h3>
              <button
                onClick={() => setShowFirefliesModal(false)}
                className="text-text-muted hover:text-text-primary transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-text-secondary mb-4">
              Enter your Fireflies API key to connect. You can find it at{' '}
              <span className="text-purple-400">Fireflies Dashboard &rarr; Integrations &rarr; Fireflies API</span>.
              Only workspace admins can access the API key.
            </p>

            <div className="mb-4">
              <label className="block text-xs font-medium text-text-muted mb-1.5">
                API Key
              </label>
              <input
                type="password"
                value={firefliesApiKey}
                onChange={(e) => setFirefliesApiKey(e.target.value)}
                placeholder="Enter your Fireflies API key..."
                className="w-full rounded-lg border border-border-primary bg-bg-secondary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-purple-500 focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveFirefliesKey();
                }}
              />
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowFirefliesModal(false)}
                className="border border-border-primary bg-bg-card hover:bg-bg-elevated text-text-secondary rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveFirefliesKey}
                disabled={firefliesConnecting || !firefliesApiKey.trim()}
                className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              >
                {firefliesConnecting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {firefliesConnecting ? 'Verifying...' : 'Connect'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Disconnect Confirmation Modal */}
      {confirmDisconnect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-bg-card border border-border-primary rounded-lg p-6 w-full max-w-sm mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-900/30">
                <Unplug className="h-5 w-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-text-primary">
                  Disconnect {confirmDisconnect === 'github' ? 'GitHub' : 'Fireflies.ai'}?
                </h3>
                <p className="text-xs text-text-muted">
                  This action can be undone by reconnecting.
                </p>
              </div>
            </div>

            <p className="text-xs text-text-secondary mb-5">
              {confirmDisconnect === 'github'
                ? 'This will stop tracking commits, pull requests, and code reviews from your GitHub repositories.'
                : 'This will stop syncing meeting transcripts and extracting action items from Fireflies.ai.'}
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setConfirmDisconnect(null)}
                className="border border-border-primary bg-bg-card hover:bg-bg-elevated text-text-secondary rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDisconnect(confirmDisconnect)}
                className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              >
                <Unplug className="h-4 w-4" />
                Disconnect
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Integration Cards */}
      <div className="grid gap-4">
        {integrationCards.map((card) => {
          const Icon = card.icon;
          const isConnected =
            (card.id === 'github' && isGitHubConnected) ||
            (card.id === 'fireflies' && isFirefliesConnected);
          const isAvailable = card.available;

          return (
            <div
              key={card.id}
              className="bg-bg-card border border-border-primary rounded-lg p-5 hover:border-border-hover transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                      isConnected
                        ? 'bg-emerald-900/30 text-emerald-400'
                        : isAvailable
                        ? 'bg-purple-900/30 text-purple-400'
                        : 'bg-bg-elevated text-text-muted'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-text-primary">
                        {card.name}
                      </h3>
                      {isConnected && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-900/30 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                          <Check className="h-3 w-3" />
                          Connected
                        </span>
                      )}
                      {!isAvailable && (
                        <span className="inline-flex items-center rounded-full bg-bg-elevated px-2 py-0.5 text-[10px] font-medium text-text-muted">
                          Coming Soon
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-text-muted">
                      {card.description}
                    </p>
                  </div>
                </div>

                <div>
                  {card.id === 'github' && !isConnected && isAvailable && (
                    <button
                      onClick={handleConnectGitHub}
                      disabled={loading || !teamId}
                      className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
                    >
                      {loading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Plug className="h-4 w-4" />
                      )}
                      Connect GitHub
                    </button>
                  )}
                  {card.id === 'fireflies' && !isConnected && isAvailable && (
                    <button
                      onClick={handleConnectFireflies}
                      disabled={loading || !teamId}
                      className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
                    >
                      {loading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Key className="h-4 w-4" />
                      )}
                      Connect with API Key
                    </button>
                  )}
                  {isConnected && isAvailable && (
                    <button
                      onClick={() => setConfirmDisconnect(card.id)}
                      disabled={disconnecting === card.id}
                      className="flex items-center gap-2 bg-red-900/30 hover:bg-red-900/50 disabled:opacity-50 disabled:cursor-not-allowed text-red-400 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
                    >
                      {disconnecting === card.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Unplug className="h-3 w-3" />
                      )}
                      {disconnecting === card.id ? 'Disconnecting...' : 'Disconnect'}
                    </button>
                  )}
                </div>
              </div>

              {/* GitHub Connected: Show installed repos */}
              {card.id === 'github' && isConnected && repos.length > 0 && (
                <div className="mt-4 border-t border-border-primary pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                      Tracked Repositories ({repos.length})
                    </h4>
                    <a
                      href={`https://github.com/settings/installations`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[10px] text-purple-400 hover:text-purple-300 transition-colors"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Manage in GitHub
                    </a>
                  </div>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {repos.map((repo) => (
                      <div
                        key={repo.fullName ?? repo.name}
                        className="flex items-center gap-3 rounded-md bg-bg-secondary px-3 py-2"
                      >
                        <Github className="h-3.5 w-3.5 text-text-muted shrink-0" />
                        <span className="text-sm text-text-primary truncate">
                          {repo.fullName ?? repo.name}
                        </span>
                        {repo.language && (
                          <span className="text-xs text-text-muted shrink-0">
                            {repo.language}
                          </span>
                        )}
                        {repo.private && (
                          <span className="inline-flex items-center rounded bg-yellow-900/30 px-1.5 py-0.5 text-[10px] text-yellow-400 shrink-0">
                            Private
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* GitHub sync controls */}
              {card.id === 'github' && isConnected && (
                <div className="mt-4 border-t border-border-primary pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-1">
                        Code Sync
                      </h4>
                      <p className="text-xs text-text-muted">
                        {githubLastSyncAt
                          ? `Last synced: ${new Date(githubLastSyncAt).toLocaleString()}`
                          : 'Commits and PRs are captured automatically via webhooks. Use Sync Now to pull any missed data.'}
                      </p>
                    </div>
                    <button
                      onClick={handleGithubSync}
                      disabled={githubSyncing}
                      className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
                    >
                      <RefreshCw className={`h-4 w-4 ${githubSyncing ? 'animate-spin' : ''}`} />
                      {githubSyncing ? 'Syncing...' : 'Sync Now'}
                    </button>
                  </div>
                </div>
              )}

              {/* Fireflies connected details */}
              {card.id === 'fireflies' && isFirefliesConnected && (
                <div className="mt-4 border-t border-border-primary pt-4">
                  {/* Sync Controls */}
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-1">
                        Meeting Sync
                      </h4>
                      <p className="text-xs text-text-muted">
                        {lastSyncAt
                          ? `Last synced: ${new Date(lastSyncAt).toLocaleString()}`
                          : 'Not synced yet — click Sync Now to pull meetings'}
                      </p>
                    </div>
                    <button
                      onClick={handleFirefliesSync}
                      disabled={firefliesSyncing}
                      className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
                    >
                      <RefreshCw className={`h-4 w-4 ${firefliesSyncing ? 'animate-spin' : ''}`} />
                      {firefliesSyncing ? 'Syncing...' : 'Sync Now'}
                    </button>
                  </div>

                  {/* How It Works */}
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-2">
                      How It Works
                    </h4>
                    <div className="space-y-1.5">
                      <div className="flex items-start gap-2 text-xs text-text-secondary">
                        <span className="text-purple-400 mt-0.5">1.</span>
                        <span>Fireflies bot joins your meetings and transcribes them</span>
                      </div>
                      <div className="flex items-start gap-2 text-xs text-text-secondary">
                        <span className="text-purple-400 mt-0.5">2.</span>
                        <span>Click &quot;Sync Now&quot; to pull new meetings into EvaluateAI</span>
                      </div>
                      <div className="flex items-start gap-2 text-xs text-text-secondary">
                        <span className="text-purple-400 mt-0.5">3.</span>
                        <span>AI extracts action items and assigns to team members</span>
                      </div>
                      <div className="flex items-start gap-2 text-xs text-text-secondary">
                        <span className="text-purple-400 mt-0.5">4.</span>
                        <span>Track task delivery on the Meetings page</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
