'use client';

import { useState, useEffect, Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth, useCanAccess } from '@/components/auth-provider';
import {
  Github,
  Mic,
  Trello,
  MessageSquare,
  Check,
  AlertCircle,
  Info,
  Plug,
  Search,
  Code2,
  Video,
} from 'lucide-react';
import { IntegrationCard } from '@/components/integrations/integration-card';
import { ManageModal } from '@/components/integrations/manage-modal';
import {
  FirefliesConnectModal,
  DisconnectModal,
} from '@/components/integrations/connect-modals';
import { RepoPickerModal } from '@/components/integrations/repo-picker-modal';
import { TeamCoverageRoster } from '@/components/integrations/team-coverage-roster';
import { SyncProgress } from '@/components/integrations/sync-progress';
import { OnboardingNudge } from '@/components/integrations/onboarding-nudge';
import type {
  Integration,
  IntegrationCardDef,
  Repo,
  RepoGroup,
  DiscoverRepo,
} from '@/components/integrations/types';

// ---------- Card Definitions ----------

const integrationCards: IntegrationCardDef[] = [
  {
    id: 'github',
    name: 'GitHub',
    description: 'Track commits, pull requests, and code reviews from your repositories.',
    icon: Github,
    available: true,
    category: 'code',
  },
  {
    id: 'jira',
    name: 'Jira',
    description: 'Sync tasks, sprints, and project tracking across your team.',
    icon: Trello,
    available: false,
    category: 'code',
  },
  {
    id: 'fireflies',
    name: 'Fireflies.ai',
    description: 'Auto-capture meeting transcripts and extract action items.',
    icon: Mic,
    available: true,
    category: 'meetings',
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Daily digests, alerts, and team notifications in your channels.',
    icon: MessageSquare,
    available: false,
    category: 'meetings',
  },
];

const categories = [
  {
    id: 'code',
    label: 'Code & Development',
    icon: Code2,
  },
  {
    id: 'meetings',
    label: 'Meetings & Communication',
    icon: Video,
  },
] as const;

// ---------- Wrapper ----------

export default function IntegrationsPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin h-8 w-8 border-2 border-purple-500 border-t-transparent rounded-full" />
        </div>
      }
    >
      <IntegrationsPage />
    </Suspense>
  );
}

// ---------- Main Page ----------

function IntegrationsPage() {
  const searchParams = useSearchParams();
  const { user: authUser } = useAuth();
  const teamId = authUser?.teamId ?? '';
  const userId = authUser?.id ?? '';
  const canManage = useCanAccess('owner', 'manager');

  // Per-team feature flag: when v2 is on, any team member can connect their own
  // accounts; the read-only banner is suppressed; coverage roster + job-based
  // sync progress replace the legacy in-request sync.
  const [isV2, setIsV2] = useState<boolean | null>(null);
  const [activeSyncJob, setActiveSyncJob] = useState<{
    provider: 'github' | 'fireflies';
    jobId: string;
  } | null>(null);
  const [rosterRefreshKey, setRosterRefreshKey] = useState(0);

  // Integration state
  const [githubIntegration, setGithubIntegration] = useState<Integration | null>(null);
  const [firefliesIntegration, setFirefliesIntegration] = useState<Integration | null>(null);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [oauthUser, setOauthUser] = useState<string | null>(null);

  // Messages
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync state
  const [githubSyncing, setGithubSyncing] = useState(false);
  const [githubLastSyncAt, setGithubLastSyncAt] = useState<string | null>(null);
  const [firefliesSyncing, setFirefliesSyncing] = useState(false);
  const [firefliesLastSyncAt, setFirefliesLastSyncAt] = useState<string | null>(null);

  // Modal state
  const [manageModalId, setManageModalId] = useState<string | null>(null);
  const [showFirefliesModal, setShowFirefliesModal] = useState(false);
  const [firefliesApiKey, setFirefliesApiKey] = useState('');
  const [firefliesConnecting, setFirefliesConnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  // Repo picker
  const [showRepoPicker, setShowRepoPicker] = useState(false);
  const [repoGroups, setRepoGroups] = useState<RepoGroup[]>([]);
  const [selectedRepos, setSelectedRepos] = useState<Set<string>>(new Set());
  const [repoPickerLoading, setRepoPickerLoading] = useState(false);
  const [repoPickerSaving, setRepoPickerSaving] = useState(false);
  const [repoSearchQuery, setRepoSearchQuery] = useState('');

  // Search
  const [searchQuery, setSearchQuery] = useState('');

  // Derived
  const isGitHubConnected = githubIntegration !== null;
  const isFirefliesConnected = firefliesIntegration !== null;
  const connectedCount = (isGitHubConnected ? 1 : 0) + (isFirefliesConnected ? 1 : 0);

  const filteredCards = useMemo(() => {
    if (!searchQuery.trim()) return integrationCards;
    const q = searchQuery.toLowerCase();
    return integrationCards.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  function isConnected(id: string) {
    return (id === 'github' && isGitHubConnected) || (id === 'fireflies' && isFirefliesConnected);
  }

  // ---------- URL param handling ----------
  useEffect(() => {
    const success = searchParams.get('success');
    const error = searchParams.get('error');

    if (success === 'github_connected') {
      setSuccessMsg('GitHub connected successfully! Select repositories to track.');
      setTimeout(() => setSuccessMsg(null), 7000);
    }
    if (error) {
      const errorMessages: Record<string, string> = {
        missing_params: 'GitHub authorization failed: missing parameters',
        invalid_state: 'GitHub authorization failed: invalid state',
        oauth_denied: 'GitHub authorization was denied. Please try again.',
        callback_failed: 'GitHub connection failed. Please try again.',
      };
      setErrorMsg(errorMessages[error] ?? 'An error occurred');
      setTimeout(() => setErrorMsg(null), 5000);
    }
  }, [searchParams]);

  // ---------- Fetch integration statuses ----------
  useEffect(() => {
    if (!teamId) {
      setLoading(false);
      return;
    }

    async function fetchIntegrations() {
      try {
        // Detect v2 up front so the rest of the UI can branch consistently.
        // Under v2, per-user state also comes from this same payload — saves
        // an extra round-trip and avoids the previous bug where the legacy
        // `/github/repos` endpoint (team-scoped, owner/manager-visible) made
        // developers see the manager's connection as if it were their own.
        let statusBody: {
          flow: 'v2' | 'legacy';
          providers: Record<
            'github' | 'fireflies',
            {
              connected?: boolean;
              members?: Array<{
                userId: string;
                status: string;
                externalAccountHandle: string | null;
                lastSyncAt: string | null;
                accessibleRepoCount?: number;
              }>;
              oauthUser?: string | null;
              lastSyncAt?: string | null;
              trackedRepoCount?: number;
            }
          >;
        } | null = null;

        try {
          const statusRes = await fetch(`/api/integrations/status?team_id=${teamId}`);
          if (statusRes.ok) {
            statusBody = await statusRes.json();
            setIsV2(statusBody?.flow === 'v2');
          } else {
            setIsV2(false);
          }
        } catch {
          setIsV2(false);
        }

        if (statusBody?.flow === 'v2') {
          // -------------- v2: per-user state from status members list --------------
          const myGh = statusBody.providers.github.members?.find(
            (m) => m.userId === userId && m.status === 'active'
          );
          if (myGh) {
            setGithubIntegration({
              id: 'github',
              provider: 'github',
              status: 'active',
              config: {},
              lastSyncAt: myGh.lastSyncAt ?? null,
            });
            setOauthUser(myGh.externalAccountHandle ?? null);
            setGithubLastSyncAt(myGh.lastSyncAt ?? null);
          } else {
            setGithubIntegration(null);
            setRepos([]);
            setOauthUser(null);
          }

          const myFf = statusBody.providers.fireflies.members?.find(
            (m) => m.userId === userId && m.status === 'active'
          );
          if (myFf) {
            setFirefliesIntegration({
              id: 'fireflies',
              provider: 'fireflies',
              status: 'active',
              config: {},
              lastSyncAt: myFf.lastSyncAt ?? null,
            });
            setFirefliesLastSyncAt(myFf.lastSyncAt ?? null);
          } else {
            setFirefliesIntegration(null);
            setFirefliesLastSyncAt(null);
          }

          // Managers/owners who have connected personally can still open the
          // team-tracked-repos picker. Fetch the picker data only for them —
          // the discover endpoint is role-gated (403 for devs), and devs
          // don't manage team repos anyway.
          if (canManage && myGh) {
            try {
              const ghReposRes = await fetch(`/api/integrations/github/repos?team_id=${teamId}`);
              if (ghReposRes.ok) {
                const repoData = await ghReposRes.json();
                setRepos(repoData.repos ?? []);
              }
            } catch {
              // Non-critical; picker can still be opened manually.
            }
          }
        } else {
          // -------------- Legacy: team-wide connection state --------------
          const ghReposRes = await fetch(`/api/integrations/github/repos?team_id=${teamId}`);
          if (ghReposRes.ok) {
            const data = await ghReposRes.json();
            setRepos(data.repos ?? []);
            setOauthUser(data.oauthUser ?? null);
            setGithubIntegration({
              id: 'github',
              provider: 'github',
              status: 'active',
              config: {},
              lastSyncAt: null,
            });

            if ((data.repos ?? []).length === 0 && canManage) {
              handleOpenRepoPicker();
            }
          }

          const ffRes = await fetch(`/api/integrations/fireflies/status?team_id=${teamId}`);
          if (ffRes.ok) {
            const data = await ffRes.json();
            if (data.connected) {
              setFirefliesIntegration({
                id: 'fireflies',
                provider: 'fireflies',
                status: 'active',
                config: { connected_at: data.connectedAt },
                lastSyncAt: data.lastSyncAt,
              });
              setFirefliesLastSyncAt(data.lastSyncAt ?? null);
            }
          }
        }
      } catch {
        // Not connected — that's fine
      } finally {
        setLoading(false);
      }
    }

    fetchIntegrations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  // ---------- Handlers ----------

  const READ_ONLY_MSG = 'Only owners and managers can configure integrations.';

  /**
   * In v1, only owners/managers can write. In v2, any team member can
   * connect their own accounts or trigger a sync — per-user access rules
   * are enforced server-side. The client only gates the legacy flow.
   */
  function guardWrite(): boolean {
    if (isV2 || canManage) return true;
    setErrorMsg(READ_ONLY_MSG);
    setTimeout(() => setErrorMsg(null), 4000);
    return false;
  }

  function handleConnect(id: string) {
    if (!guardWrite()) return;
    if (id === 'github') {
      window.location.href = `/api/integrations/github/connect?team_id=${teamId}`;
    } else if (id === 'fireflies') {
      setShowFirefliesModal(true);
      setFirefliesApiKey('');
    }
  }

  function handleManage(id: string) {
    setManageModalId(id);
  }

  async function handleOpenRepoPicker() {
    if (!guardWrite()) return;
    setManageModalId(null);
    setShowRepoPicker(true);
    setRepoPickerLoading(true);
    setRepoSearchQuery('');

    try {
      const res = await fetch(`/api/integrations/github/discover?team_id=${teamId}`);
      if (!res.ok) {
        const data = await res.json();
        setErrorMsg(data.error ?? 'Failed to load repositories');
        setShowRepoPicker(false);
        return;
      }

      const data = await res.json();
      setRepoGroups(data.groups ?? []);

      const tracked = new Set<string>();
      for (const group of (data.groups as RepoGroup[]) ?? []) {
        for (const repo of group.repos) {
          if (repo.tracked) tracked.add(repo.fullName);
        }
      }
      setSelectedRepos(tracked);
    } catch {
      setErrorMsg('Failed to load repositories from GitHub');
      setShowRepoPicker(false);
    } finally {
      setRepoPickerLoading(false);
    }
  }

  function toggleRepo(fullName: string) {
    setSelectedRepos((prev) => {
      const next = new Set(prev);
      if (next.has(fullName)) next.delete(fullName);
      else next.add(fullName);
      return next;
    });
  }

  function getFilteredRepos(groupRepos: DiscoverRepo[]): DiscoverRepo[] {
    if (!repoSearchQuery.trim()) return groupRepos;
    const q = repoSearchQuery.toLowerCase();
    return groupRepos.filter(
      (r) =>
        r.fullName.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        (r.language ?? '').toLowerCase().includes(q)
    );
  }

  function toggleGroup(group: RepoGroup) {
    const filtered = getFilteredRepos(group.repos);
    const allSelected = filtered.every((r) => selectedRepos.has(r.fullName));
    setSelectedRepos((prev) => {
      const next = new Set(prev);
      for (const repo of filtered) {
        if (allSelected) next.delete(repo.fullName);
        else next.add(repo.fullName);
      }
      return next;
    });
  }

  async function handleSaveTrackedRepos() {
    if (!guardWrite()) return;
    setRepoPickerSaving(true);
    try {
      const res = await fetch('/api/integrations/github/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_id: teamId, repos: [...selectedRepos] }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error ?? 'Failed to save repo selection');
        return;
      }

      setShowRepoPicker(false);
      setSuccessMsg(
        `Now tracking ${data.trackedCount} repositor${data.trackedCount === 1 ? 'y' : 'ies'}.`
      );
      setTimeout(() => setSuccessMsg(null), 5000);

      const ghReposRes = await fetch(`/api/integrations/github/repos?team_id=${teamId}`);
      if (ghReposRes.ok) {
        const repoData = await ghReposRes.json();
        setRepos(repoData.repos ?? []);
      }
    } catch {
      setErrorMsg('Failed to save repo selection. Please try again.');
    } finally {
      setRepoPickerSaving(false);
    }
  }

  async function handleSaveFirefliesKey() {
    if (!guardWrite()) return;
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

  async function handleDisconnect(provider: string) {
    if (!guardWrite()) return;
    setConfirmDisconnect(null);
    setManageModalId(null);
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
        setOauthUser(null);
      } else if (provider === 'fireflies') {
        setFirefliesIntegration(null);
        setFirefliesLastSyncAt(null);
      }

      setSuccessMsg(
        `${provider === 'github' ? 'GitHub' : 'Fireflies.ai'} disconnected successfully.`
      );
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch {
      setErrorMsg('Failed to disconnect. Please try again.');
    } finally {
      setDisconnecting(null);
    }
  }

  async function handleGithubSync() {
    if (!guardWrite()) return;
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

      // v2 returns 202 with a jobId — SyncProgress will poll and announce
      // completion; the in-page button state clears in onComplete.
      if (res.status === 202 && data.jobId) {
        setActiveSyncJob({ provider: 'github', jobId: data.jobId });
        return;
      }

      setGithubLastSyncAt(data.syncedAt);

      const parts: string[] = [];
      if (data.commitsProcessed > 0)
        parts.push(`${data.commitsProcessed} commit${data.commitsProcessed !== 1 ? 's' : ''}`);
      if (data.prsProcessed > 0)
        parts.push(`${data.prsProcessed} PR${data.prsProcessed !== 1 ? 's' : ''}`);

      if (parts.length > 0) {
        setSuccessMsg(
          `Synced ${parts.join(' and ')} from ${data.reposSynced} repo${data.reposSynced !== 1 ? 's' : ''}.`
        );
      } else {
        setSuccessMsg('All data already synced. No new commits or PRs found.');
      }
      setTimeout(() => setSuccessMsg(null), 7000);
    } catch {
      setErrorMsg('Failed to sync GitHub data. Please try again.');
    } finally {
      // v2 path keeps the spinner until SyncProgress resolves; we only
      // clear here for the legacy synchronous path.
      if (!activeSyncJob) setGithubSyncing(false);
    }
  }

  async function handleFirefliesSync() {
    if (!guardWrite()) return;
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

      if (res.status === 202 && data.jobId) {
        setActiveSyncJob({ provider: 'fireflies', jobId: data.jobId });
        return;
      }

      setFirefliesLastSyncAt(data.syncedAt);

      if (data.meetingsProcessed > 0) {
        setSuccessMsg(
          `Synced ${data.meetingsProcessed} new meeting${data.meetingsProcessed !== 1 ? 's' : ''}` +
            (data.tasksExtracted > 0
              ? ` with ${data.tasksExtracted} action item${data.tasksExtracted !== 1 ? 's' : ''} extracted`
              : '') +
            `. ${data.meetingsSkipped > 0 ? `${data.meetingsSkipped} already synced.` : ''}`
        );
      } else if (data.meetingsFound === 0) {
        setSuccessMsg('No new meetings found since last sync.');
      } else {
        setSuccessMsg(
          `All ${data.meetingsSkipped} meeting${data.meetingsSkipped !== 1 ? 's' : ''} already synced.`
        );
      }
      setTimeout(() => setSuccessMsg(null), 7000);
    } catch {
      setErrorMsg('Failed to sync meetings. Please try again.');
    } finally {
      if (!activeSyncJob) setFirefliesSyncing(false);
    }
  }

  /** Called by SyncProgress once the background job resolves. */
  function handleSyncJobComplete(job: {
    status: 'pending' | 'running' | 'done' | 'failed';
    progress: Record<string, unknown>;
    error: string | null;
  }): void {
    if (!activeSyncJob) return;
    const { provider } = activeSyncJob;
    if (provider === 'github') {
      setGithubSyncing(false);
      setGithubLastSyncAt(new Date().toISOString());
    } else {
      setFirefliesSyncing(false);
      setFirefliesLastSyncAt(new Date().toISOString());
    }
    setActiveSyncJob(null);
    setRosterRefreshKey((k) => k + 1);

    // Surface a message so fast-completing syncs don't flicker silently.
    if (job.status === 'failed') {
      setErrorMsg(job.error ?? 'Sync failed');
      setTimeout(() => setErrorMsg(null), 8000);
      return;
    }

    const p = job.progress as Record<string, number | undefined>;
    const parts: string[] = [];
    if (provider === 'github') {
      const synced = p.reposSynced ?? 0;
      const total = p.reposTotal ?? 0;
      const skipped = p.reposSkipped304 ?? 0;
      const uncovered = p.reposUncovered ?? 0;
      const commits = p.commitsInserted ?? 0;
      const prs = p.prsInserted ?? 0;
      parts.push(`Synced ${synced} of ${total} repo${total === 1 ? '' : 's'}`);
      if (skipped > 0) parts.push(`${skipped} unchanged`);
      if (uncovered > 0) parts.push(`${uncovered} need coverage`);
      if (commits > 0) parts.push(`${commits} new commit${commits === 1 ? '' : 's'}`);
      if (prs > 0) parts.push(`${prs} new PR${prs === 1 ? '' : 's'}`);
    } else {
      const meetings = p.meetingsInserted ?? 0;
      const usersTotal = p.usersTotal ?? 0;
      const usersFailed = p.usersFailed ?? 0;
      parts.push(
        meetings > 0
          ? `Captured ${meetings} new meeting${meetings === 1 ? '' : 's'}`
          : 'No new meetings'
      );
      if (usersTotal > 0) parts.push(`across ${usersTotal} connected user${usersTotal === 1 ? '' : 's'}`);
      if (usersFailed > 0) parts.push(`${usersFailed} failed`);
    }
    setSuccessMsg(parts.join(' · '));
    setTimeout(() => setSuccessMsg(null), 8000);
  }

  // Get data for the manage modal
  const managedCard = manageModalId
    ? integrationCards.find((c) => c.id === manageModalId)
    : null;

  const disconnectMessages: Record<string, { name: string; description: string }> = {
    github: {
      name: 'GitHub',
      description:
        'This will stop tracking commits, pull requests, and code reviews from your GitHub repositories.',
    },
    fireflies: {
      name: 'Fireflies.ai',
      description:
        'This will stop syncing meeting transcripts and extracting action items from Fireflies.ai.',
    },
  };

  // ---------- Render ----------

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-text-primary">
              Integrations
            </h1>
            <p className="mt-1 text-sm text-text-secondary">
              Connect your tools to track developer activity automatically
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1.5 rounded-full bg-bg-card border border-border-primary px-3 py-1.5">
              <Plug className="h-3.5 w-3.5 text-purple-400" />
              <span className="text-xs font-medium text-text-secondary">
                <span className="text-text-primary">{connectedCount}</span> of{' '}
                {integrationCards.filter((c) => c.available).length} connected
              </span>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search integrations..."
            className="w-full rounded-lg border border-border-primary bg-bg-card pl-10 pr-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-purple-500 focus:outline-none transition-colors"
          />
        </div>
      </div>

      {/* Read-only banner only applies under the legacy flow. Under v2, any
          team member can connect their own accounts and trigger syncs, so
          the banner would be misleading. */}
      {!canManage && isV2 === false && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-blue-800/50 bg-blue-900/20 px-4 py-3 text-sm text-blue-300">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Read-only access</p>
            <p className="text-xs text-blue-400 mt-0.5">
              Only owners and managers can connect, sync, or disconnect integrations. You can see which ones are active.
            </p>
          </div>
        </div>
      )}

      {/* V2 onboarding nudge: dismissible; only renders for users on v2 teams
          who haven't connected any provider yet. */}
      {isV2 && teamId && userId && (
        <OnboardingNudge teamId={teamId} currentUserId={userId} />
      )}

      {/* Active sync progress (v2). Rendered at the top so users don't have to
          scroll to see that their click actually did something. */}
      {activeSyncJob && (
        <div className="mb-6 rounded-lg border border-purple-800/40 bg-purple-900/10 px-4 py-3">
          <div className="text-[11px] font-semibold text-purple-300 uppercase tracking-wider mb-1.5">
            {activeSyncJob.provider === 'github' ? 'GitHub' : 'Fireflies'} sync in progress
          </div>
          <SyncProgress
            jobId={activeSyncJob.jobId}
            onComplete={handleSyncJobComplete}
          />
        </div>
      )}

      {/* Messages */}
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

      {/* Category Sections */}
      <div className="space-y-8">
        {categories.map((category) => {
          const CategoryIcon = category.icon;
          const cardsInCategory = filteredCards.filter(
            (c) => c.category === category.id
          );

          if (cardsInCategory.length === 0) return null;

          return (
            <section key={category.id} className="animate-section">
              <div className="flex items-center gap-2 mb-4">
                <CategoryIcon className="h-4 w-4 text-text-muted" />
                <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                  {category.label}
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {cardsInCategory.map((card) => (
                  <IntegrationCard
                    key={card.id}
                    card={card}
                    isConnected={isConnected(card.id)}
                    loading={loading}
                    syncing={
                      card.id === 'github' ? githubSyncing : card.id === 'fireflies' ? firefliesSyncing : false
                    }
                    teamId={teamId}
                    onConnect={handleConnect}
                    onManage={handleManage}
                    onSync={(id) => {
                      if (id === 'github') handleGithubSync();
                      else if (id === 'fireflies') handleFirefliesSync();
                    }}
                    // Under v2, Manage targets team-tracked-repos which is
                    // owner/manager-only. Developers get a Disconnect button
                    // in its place so they can revoke their own credential.
                    // Legacy path (canManage-only users already on the page)
                    // keeps showing Manage for parity.
                    showManage={isV2 ? canManage : true}
                    onDisconnect={(id) => setConfirmDisconnect(id)}
                  />
                ))}
              </div>
            </section>
          );
        })}

        {filteredCards.length === 0 && searchQuery && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Search className="w-10 h-10 text-text-muted mb-3" />
            <p className="text-sm text-text-secondary">
              No integrations match &ldquo;{searchQuery}&rdquo;
            </p>
          </div>
        )}

        {/* V2 team coverage roster — owner/manager-only view. Developers see
            only their own card and have no actionable items in the roster
            (can't revoke teammates, can't add members); surfacing it to them
            is informational-only, so we scope it to the role that actually
            owns team-wide coverage. rosterRefreshKey triggers a re-fetch
            after a sync so last-sync badges stay fresh. */}
        {isV2 && teamId && canManage && (
          <section className="pt-2">
            <div className="flex items-center gap-2 mb-4">
              <Plug className="h-4 w-4 text-text-muted" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                Team coverage
              </h2>
            </div>
            <TeamCoverageRoster
              key={rosterRefreshKey}
              teamId={teamId}
              canManage={canManage}
              currentUserId={userId}
              onAfterRevoke={() => setRosterRefreshKey((k) => k + 1)}
            />
          </section>
        )}
      </div>

      {/* ===== Modals ===== */}

      {/* Manage Modal */}
      {managedCard && (
        <ManageModal
          card={managedCard}
          oauthUser={oauthUser}
          repos={repos}
          lastSyncAt={managedCard.id === 'github' ? githubLastSyncAt : firefliesLastSyncAt}
          syncing={managedCard.id === 'github' ? githubSyncing : firefliesSyncing}
          onSync={managedCard.id === 'github' ? handleGithubSync : handleFirefliesSync}
          onOpenRepoPicker={handleOpenRepoPicker}
          onDisconnect={() => {
            setManageModalId(null);
            setConfirmDisconnect(managedCard.id);
          }}
          onClose={() => setManageModalId(null)}
        />
      )}

      {/* Fireflies Connect Modal */}
      {showFirefliesModal && (
        <FirefliesConnectModal
          apiKey={firefliesApiKey}
          onApiKeyChange={setFirefliesApiKey}
          connecting={firefliesConnecting}
          onConnect={handleSaveFirefliesKey}
          onClose={() => setShowFirefliesModal(false)}
        />
      )}

      {/* Disconnect Confirmation Modal */}
      {confirmDisconnect && disconnectMessages[confirmDisconnect] && (
        <DisconnectModal
          providerName={disconnectMessages[confirmDisconnect].name}
          description={disconnectMessages[confirmDisconnect].description}
          onConfirm={() => handleDisconnect(confirmDisconnect)}
          onClose={() => setConfirmDisconnect(null)}
        />
      )}

      {/* Repository Picker Modal */}
      {showRepoPicker && (
        <RepoPickerModal
          groups={repoGroups}
          selectedRepos={selectedRepos}
          searchQuery={repoSearchQuery}
          loading={repoPickerLoading}
          saving={repoPickerSaving}
          oauthUser={oauthUser}
          onSearchChange={setRepoSearchQuery}
          onToggleRepo={toggleRepo}
          onToggleGroup={toggleGroup}
          onSave={handleSaveTrackedRepos}
          onClose={() => setShowRepoPicker(false)}
        />
      )}
    </div>
  );
}
