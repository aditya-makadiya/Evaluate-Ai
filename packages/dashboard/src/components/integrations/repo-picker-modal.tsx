'use client';

import {
  X,
  Search,
  Github,
  Lock,
  Loader2,
  GitBranch,
  Check,
  Building2,
  User,
  Users,
} from 'lucide-react';
import type { DiscoverRepo, RepoGroup } from './types';
import { languageColors } from './types';

interface RepoPickerModalProps {
  groups: RepoGroup[];
  selectedRepos: Set<string>;
  searchQuery: string;
  loading: boolean;
  saving: boolean;
  oauthUser: string | null;
  onSearchChange: (query: string) => void;
  onToggleRepo: (fullName: string) => void;
  onToggleGroup: (group: RepoGroup) => void;
  onSave: () => void;
  onClose: () => void;
}

function getFilteredRepos(repos: DiscoverRepo[], query: string): DiscoverRepo[] {
  if (!query.trim()) return repos;
  const q = query.toLowerCase();
  return repos.filter(
    (r) =>
      r.fullName.toLowerCase().includes(q) ||
      r.name.toLowerCase().includes(q) ||
      (r.language ?? '').toLowerCase().includes(q)
  );
}

export function RepoPickerModal({
  groups,
  selectedRepos,
  searchQuery,
  loading,
  saving,
  oauthUser,
  onSearchChange,
  onToggleRepo,
  onToggleGroup,
  onSave,
  onClose,
}: RepoPickerModalProps) {
  const totalFilteredRepos = groups.reduce(
    (sum, g) => sum + getFilteredRepos(g.repos, searchQuery).length,
    0
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-bg-card border border-border-primary rounded-xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border-primary shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">
              Select Repositories to Track
            </h3>
            <p className="text-xs text-text-muted mt-0.5">
              {selectedRepos.size} selected
              {oauthUser && (
                <span>
                  {' '}&middot; connected as{' '}
                  <span className="text-purple-400">{oauthUser}</span>
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary transition-colors p-1 rounded-md hover:bg-bg-elevated"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-border-primary shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search repositories..."
              className="w-full rounded-lg border border-border-primary bg-bg-secondary pl-9 pr-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-purple-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Repo List */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-purple-400 mb-3" />
              <p className="text-sm text-text-secondary">
                Loading repositories from GitHub...
              </p>
            </div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <GitBranch className="w-10 h-10 text-text-muted mb-3" />
              <p className="text-sm text-text-secondary">
                No repositories found
              </p>
              <p className="text-xs text-text-muted mt-1">
                Make sure your GitHub account has accessible repositories
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {groups.map((group) => {
                const filtered = getFilteredRepos(group.repos, searchQuery);
                if (filtered.length === 0) return null;

                const allSelected = filtered.every((r) =>
                  selectedRepos.has(r.fullName)
                );

                const isOrgGroup = filtered[0]?.ownerType === 'Organization';
                const isCollabGroup = group.label === 'Collaborator Repositories';
                const GroupIcon = isOrgGroup
                  ? Building2
                  : isCollabGroup
                  ? Users
                  : User;

                return (
                  <div key={group.label}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <GroupIcon className="h-3.5 w-3.5 text-text-muted" />
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                          {group.label} ({filtered.length})
                        </h4>
                      </div>
                      <button
                        onClick={() => onToggleGroup(group)}
                        className="text-[10px] text-purple-400 hover:text-purple-300 transition-colors"
                      >
                        {allSelected ? 'Deselect all' : 'Select all'}
                      </button>
                    </div>
                    <div className="space-y-1">
                      {filtered.map((repo) => (
                        <label
                          key={repo.fullName}
                          className="flex items-center gap-3 rounded-md bg-bg-secondary px-3 py-2.5 cursor-pointer hover:bg-bg-elevated transition-colors group"
                        >
                          <input
                            type="checkbox"
                            checked={selectedRepos.has(repo.fullName)}
                            onChange={() => onToggleRepo(repo.fullName)}
                            className="h-3.5 w-3.5 rounded border-border-primary text-purple-500 focus:ring-purple-500 focus:ring-offset-0 bg-bg-card cursor-pointer accent-purple-500"
                          />
                          <Github className="h-3.5 w-3.5 text-text-muted shrink-0" />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm text-text-primary truncate block">
                              {repo.fullName}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {repo.language && (
                              <span className="flex items-center gap-1 text-xs text-text-muted">
                                <span
                                  className={`h-2 w-2 rounded-full ${
                                    languageColors[repo.language] ?? 'bg-gray-400'
                                  }`}
                                />
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
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
              {totalFilteredRepos === 0 && searchQuery && (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Search className="w-8 h-8 text-text-muted mb-2" />
                  <p className="text-sm text-text-secondary">
                    No repositories match &ldquo;{searchQuery}&rdquo;
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t border-border-primary shrink-0 bg-bg-secondary/50">
          <p className="text-xs text-text-muted">
            {selectedRepos.size} repositor
            {selectedRepos.size === 1 ? 'y' : 'ies'} selected for tracking
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="border border-border-primary bg-bg-card hover:bg-bg-elevated text-text-secondary rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              disabled={saving}
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {saving ? 'Saving...' : 'Save Selection'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
