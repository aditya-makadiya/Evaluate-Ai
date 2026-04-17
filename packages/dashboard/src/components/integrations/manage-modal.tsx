'use client';

import {
  X,
  RefreshCw,
  Unplug,
  Github,
  Lock,
  GitBranch,
  ExternalLink,
  Check,
  Settings,
  Loader2,
  Mic,
} from 'lucide-react';
import type { IntegrationCardDef, Repo } from './types';
import { languageColors } from './types';

interface ManageModalProps {
  card: IntegrationCardDef;
  oauthUser: string | null;
  repos: Repo[];
  lastSyncAt: string | null;
  syncing: boolean;
  onSync: () => void;
  onOpenRepoPicker: () => void;
  onDisconnect: () => void;
  onClose: () => void;
}

export function ManageModal({
  card,
  oauthUser,
  repos,
  lastSyncAt,
  syncing,
  onSync,
  onOpenRepoPicker,
  onDisconnect,
  onClose,
}: ManageModalProps) {
  const Icon = card.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-bg-card border border-border-primary rounded-xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border-primary shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-900/30 text-emerald-400">
              <Icon className="h-4.5 w-4.5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-primary">
                {card.name}
              </h3>
              <p className="text-xs text-text-muted">
                {oauthUser && card.id === 'github' ? (
                  <>Connected as <span className="text-purple-400">{oauthUser}</span></>
                ) : (
                  'Connected'
                )}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary transition-colors p-1 rounded-md hover:bg-bg-elevated"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Sync Section */}
          <div className="bg-bg-secondary rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-semibold text-text-primary mb-0.5">
                  {card.id === 'github' ? 'Code Sync' : 'Meeting Sync'}
                </h4>
                <p className="text-xs text-text-muted">
                  {lastSyncAt
                    ? `Last synced ${new Date(lastSyncAt).toLocaleString()}`
                    : 'Not synced yet'}
                </p>
              </div>
              <button
                onClick={onSync}
                disabled={syncing}
                className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg px-3.5 py-2 text-xs font-medium transition-colors"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing...' : 'Sync Now'}
              </button>
            </div>
          </div>

          {/* GitHub: Tracked Repos */}
          {card.id === 'github' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Tracked Repositories ({repos.length})
                </h4>
                <button
                  onClick={onOpenRepoPicker}
                  className="flex items-center gap-1 text-[11px] text-purple-400 hover:text-purple-300 transition-colors"
                >
                  <Settings className="h-3 w-3" />
                  Manage Repos
                </button>
              </div>
              {repos.length > 0 ? (
                <div className="space-y-1.5 max-h-52 overflow-y-auto">
                  {repos.map((repo) => (
                    <div
                      key={repo.fullName ?? repo.name}
                      className="flex items-center gap-3 rounded-md bg-bg-secondary px-3 py-2"
                    >
                      <Github className="h-3.5 w-3.5 text-text-muted shrink-0" />
                      <span className="text-sm text-text-primary truncate flex-1">
                        {repo.fullName ?? repo.name}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        {repo.language && (
                          <span className="flex items-center gap-1 text-xs text-text-muted">
                            <span className={`h-2 w-2 rounded-full ${languageColors[repo.language] ?? 'bg-gray-400'}`} />
                            {repo.language}
                          </span>
                        )}
                        {repo.private && (
                          <span className="inline-flex items-center gap-0.5 rounded bg-yellow-900/30 px-1.5 py-0.5 text-[10px] text-yellow-400">
                            <Lock className="h-2.5 w-2.5" />
                            Private
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <GitBranch className="w-8 h-8 text-text-muted mb-2" />
                  <p className="text-sm text-text-secondary">No repositories tracked yet</p>
                  <button
                    onClick={onOpenRepoPicker}
                    className="mt-2 text-xs text-purple-400 hover:text-purple-300 transition-colors"
                  >
                    Select repositories to track
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Fireflies: How It Works */}
          {card.id === 'fireflies' && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">
                How It Works
              </h4>
              <div className="space-y-2">
                {[
                  'Fireflies bot joins your meetings and transcribes them',
                  'Click "Sync Now" to pull new meetings into EvaluateAI',
                  'AI extracts action items and assigns to team members',
                  'Track task delivery on the Meetings page',
                ].map((step, i) => (
                  <div key={i} className="flex items-start gap-2.5 text-xs text-text-secondary">
                    <span className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-purple-900/30 text-[10px] font-semibold text-purple-400">
                      {i + 1}
                    </span>
                    <span className="pt-0.5">{step}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t border-border-primary shrink-0">
          <button
            onClick={onDisconnect}
            className="flex items-center gap-2 text-xs text-red-400 hover:text-red-300 transition-colors"
          >
            <Unplug className="h-3.5 w-3.5" />
            Disconnect
          </button>
          <button
            onClick={onClose}
            className="border border-border-primary bg-bg-card hover:bg-bg-elevated text-text-secondary rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
