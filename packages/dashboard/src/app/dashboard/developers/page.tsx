'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/auth-provider';
import {
  Users,
  CheckCircle2,
  XCircle,
  ArrowUpDown,
  AlertTriangle,
  Activity,
} from 'lucide-react';

interface Developer {
  id: string;
  userId: string;
  name: string;
  role: string;
  githubUsername: string | null;
  evaluateaiInstalled: boolean;
  avatarUrl: string | null;
  alignmentScore: number;
  commits: number;
  prs: number;
  reviews: number;
  aiCost: number;
  avgPromptScore: number | null;
  tasksCompleted: number;
  tasksTotal: number;
  status: 'on_track' | 'at_risk' | 'inactive';
}

type SortOption = 'name' | 'score' | 'cost' | 'activity';

function getScoreColor(score: number): string {
  if (score >= 80) return 'bg-emerald-900/30 text-emerald-400';
  if (score >= 60) return 'bg-blue-900/30 text-blue-400';
  if (score >= 40) return 'bg-yellow-900/30 text-yellow-400';
  return 'bg-red-900/30 text-red-400';
}

function getStatusConfig(status: string): { label: string; color: string } {
  switch (status) {
    case 'on_track': return { label: 'On Track', color: 'text-emerald-400' };
    case 'at_risk': return { label: 'At Risk', color: 'text-yellow-400' };
    case 'inactive': return { label: 'Inactive', color: 'text-red-400' };
    default: return { label: status, color: 'text-text-muted' };
  }
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

const AVATAR_COLORS = [
  'bg-purple-600', 'bg-blue-600', 'bg-cyan-600', 'bg-emerald-600',
  'bg-orange-600', 'bg-pink-600', 'bg-indigo-600', 'bg-teal-600',
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`shimmer rounded-lg ${className}`} />;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-[240px]" />)}
      </div>
    </div>
  );
}

export default function DevelopersPage() {
  const { user: authUser } = useAuth();
  const [developers, setDevelopers] = useState<Developer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('name');

  const fetchDevelopers = useCallback(() => {
    if (!authUser) return;
    fetch(`/api/dashboard/developers?sort=${sortBy}`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(json => { setDevelopers(json.developers); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [sortBy, authUser]);

  useEffect(() => {
    fetchDevelopers();
  }, [fetchDevelopers]);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="mb-8 animate-section">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-text-primary">Developers</h1>
            <p className="mt-1 text-sm text-text-muted">
              {developers.length} team member{developers.length !== 1 ? 's' : ''} this week
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ArrowUpDown className="h-3.5 w-3.5 text-text-muted" />
            <select
              value={sortBy}
              onChange={e => { setLoading(true); setSortBy(e.target.value as SortOption); }}
              className="text-sm bg-bg-card border border-border-primary rounded-lg px-3 py-1.5 text-text-secondary focus:outline-none focus:border-border-focus"
            >
              <option value="name">Name</option>
              <option value="score">Score</option>
              <option value="cost">AI Cost</option>
              <option value="activity">Activity</option>
            </select>
          </div>
        </div>
      </header>

      {!authUser && !loading && (
        <div className="animate-section flex flex-col items-center justify-center py-16 text-center">
          <Users className="w-10 h-10 text-text-muted mb-3" />
          <p className="text-sm text-text-secondary">No team linked</p>
          <p className="text-xs text-text-muted mt-1">Login and link to a team to see developers.</p>
        </div>
      )}

      {loading && authUser && <LoadingSkeleton />}

      {error && (
        <div className="animate-section rounded-lg border border-red-900/50 bg-red-950/20 p-5 text-sm text-red-400">
          <span className="font-medium">Failed to load developers:</span> {error}
        </div>
      )}

      {!loading && !error && authUser && developers.length === 0 && (
        <div className="animate-section flex flex-col items-center justify-center py-16 text-center">
          <Users className="w-10 h-10 text-text-muted mb-3" />
          <p className="text-sm text-text-secondary">No team members found</p>
          <p className="text-xs text-text-muted mt-1">Add team members in Settings to get started.</p>
        </div>
      )}

      {!loading && !error && developers.length > 0 && (
        <div className="animate-section grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {developers.map(dev => (
            <DeveloperCard key={dev.id} developer={dev} />
          ))}
        </div>
      )}
    </div>
  );
}

function DeveloperCard({ developer: dev }: { developer: Developer }) {
  const statusConfig = getStatusConfig(dev.status);
  const initials = getInitials(dev.name ?? 'U');
  const avatarColor = getAvatarColor(dev.name ?? '');

  return (
    <Link href={`/dashboard/developers/${dev.id}`}>
      <div className="bg-bg-card border border-border-primary rounded-lg p-5 hover:border-border-hover transition-colors cursor-pointer group">
        {/* Header: Avatar + Name + Score */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-full ${avatarColor} flex items-center justify-center text-white text-sm font-semibold`}>
              {initials}
            </div>
            <div>
              <p className="text-sm font-semibold text-text-primary group-hover:text-[#8b5cf6] transition-colors">
                {dev.name}
              </p>
              <p className="text-xs text-text-muted">{dev.role ?? 'Developer'}</p>
            </div>
          </div>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getScoreColor(dev.alignmentScore)}`}>
            {dev.alignmentScore}
          </span>
        </div>

        {/* Bottom: installed + status */}
        <div className="flex items-center justify-between pt-3 border-t border-border-primary">
          <div className="flex items-center gap-1">
            {dev.evaluateaiInstalled ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <XCircle className="h-3.5 w-3.5 text-red-400" />
            )}
            <span className="text-[10px] text-text-muted">evaluateai</span>
          </div>
          <div className="flex items-center gap-1">
            {dev.status === 'at_risk' && <AlertTriangle className="h-3 w-3 text-yellow-400" />}
            {dev.status === 'inactive' && <Activity className="h-3 w-3 text-red-400" />}
            <span className={`text-xs font-medium ${statusConfig.color}`}>
              {statusConfig.label}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
