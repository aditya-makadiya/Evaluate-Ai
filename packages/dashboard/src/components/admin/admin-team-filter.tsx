'use client';

import { useState, useEffect } from 'react';
import { Building2, X } from 'lucide-react';

interface Team {
  id: string;
  name: string;
}

interface AdminTeamFilterProps {
  value: string;
  onChange: (teamId: string) => void;
}

export function AdminTeamFilter({ value, onChange }: AdminTeamFilterProps) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/teams')
      .then((res) => res.json())
      .then((data) => {
        const list = (data.teams ?? []).map((t: { id: string; name: string }) => ({
          id: t.id,
          name: t.name,
        }));
        setTeams(list.sort((a: Team, b: Team) => a.name.localeCompare(b.name)));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const selectedTeam = teams.find((t) => t.id === value);

  return (
    <div className="flex items-center gap-2">
      <Building2 className="h-3.5 w-3.5 text-text-muted shrink-0" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading}
        className="rounded-lg border border-border-primary bg-bg-card px-3 py-1.5 text-xs text-text-primary focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500/30 min-w-[140px]"
      >
        <option value="">All Teams</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
      {value && (
        <button
          onClick={() => onChange('')}
          className="h-5 w-5 rounded flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors"
          title="Clear team filter"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
