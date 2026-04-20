'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Users,
  Hash,
  GitBranch,
  Terminal,
  CheckCircle2,
  Plus,
  Trash2,
  Copy,
  Check,
  ArrowRight,
  ArrowLeft,
  UserPlus,
  AlertCircle,
  Search,
} from 'lucide-react';
import { useAuth } from '@/components/auth-provider';

const TOTAL_STEPS = 5;

interface TeamMember {
  email: string;
  name: string;
  role: 'developer' | 'manager';
}

interface FoundTeam {
  id: string;
  name: string;
  memberCount: number;
}

export default function OnboardingPage() {
  const router = useRouter();
  const { user, loading: authLoading, refresh } = useAuth();
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<'create' | 'join' | null>(null);

  // Redirect users who ALREADY had a team when they landed on this page.
  // This must only fire once per mount — otherwise `refresh()` after
  // create/join populates `user.teamId` and self-evicts the user from the
  // wizard before Steps 3–5 render.
  const hasCheckedInitialRedirectRef = useRef(false);
  useEffect(() => {
    if (authLoading) return;
    if (hasCheckedInitialRedirectRef.current) return;
    hasCheckedInitialRedirectRef.current = true;
    if (user?.teamId) {
      router.replace('/dashboard');
    }
  }, [authLoading, user, router]);

  // Create team state
  const [teamName, setTeamName] = useState('');
  const [teamId, setTeamId] = useState('');
  const [teamCode, setTeamCode] = useState('');

  // Join team state
  const [joinCode, setJoinCode] = useState('');
  const [foundTeam, setFoundTeam] = useState<FoundTeam | null>(null);
  const [lookupError, setLookupError] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);

  // Shared state
  const [members, setMembers] = useState<TeamMember[]>([
    { email: '', name: '', role: 'developer' },
  ]);
  const [githubConnected, setGithubConnected] = useState(false);
  const [copiedSetup, setCopiedSetup] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const slug = teamName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const progressPct = (step / TOTAL_STEPS) * 100;

  const handleCreateTeam = async () => {
    if (!teamName.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: teamName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create team');
        return;
      }
      setTeamId(data.team?.id || slug);
      setTeamCode(data.team?.teamCode || '');
      await refresh();
      setStep(2);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const parseJsonSafe = async (res: Response): Promise<Record<string, unknown> | null> => {
    try {
      return await res.json();
    } catch {
      return null;
    }
  };

  const handleLookupTeam = async () => {
    if (!joinCode.trim()) return;
    setLookupLoading(true);
    setLookupError('');
    setFoundTeam(null);
    try {
      const res = await fetch(`/api/teams/join?code=${encodeURIComponent(joinCode.trim())}`);
      const data = await parseJsonSafe(res);

      if (!res.ok) {
        if (res.status === 401) {
          setLookupError('Please confirm your email and sign in to continue.');
          return;
        }
        setLookupError((data?.error as string) || `Team not found (code ${res.status})`);
        return;
      }

      if (!data?.team) {
        setLookupError('Unexpected response from server. Please try again.');
        return;
      }
      setFoundTeam(data.team as FoundTeam);
    } catch {
      setLookupError('Could not reach the server. Check your connection and retry.');
    } finally {
      setLookupLoading(false);
    }
  };

  const handleJoinTeam = async () => {
    if (!foundTeam) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/teams/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: joinCode.trim() }),
      });
      const data = await parseJsonSafe(res);

      if (!res.ok) {
        if (res.status === 401) {
          setError('Your session has expired. Please sign in again to join this team.');
          return;
        }
        setError((data?.error as string) || 'Failed to join team');
        return;
      }

      const team = data?.team as { id?: string; name?: string } | undefined;
      setTeamId(team?.id || '');
      setTeamName(team?.name || '');
      await refresh();
      // Joiners skip Step 2 (share code — irrelevant) AND Step 3 (GitHub —
      // a team-level connection owned by the manager/owner). Jump straight
      // to the CLI install step so they get their personal setup one-liner.
      setStep(4);
    } catch {
      setError('Could not reach the server. Check your connection and retry.');
    } finally {
      setLoading(false);
    }
  };

  const handleInviteMembers = async () => {
    const validMembers = members.filter((m) => m.email.trim());
    if (validMembers.length === 0) {
      setStep(3);
      return;
    }
    setLoading(true);
    try {
      await fetch(`/api/teams/${teamId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ members: validMembers }),
      });
    } catch {
      // Continue anyway
    } finally {
      setLoading(false);
      setStep(3);
    }
  };

  const handleConnectGithub = () => {
    window.open(`/api/integrations/github/connect?team=${teamId}`, '_blank');
    setGithubConnected(true);
  };

  // Install + setup command. `evalai setup` runs browser OAuth itself, so no
  // pre-provisioned token is needed — users can always generate one later
  // from Profile → CLI & API Keys for zero-browser environments.
  const setupOneLiner = 'npm install -g evaluateai && evalai setup';

  const copyToClipboard = useCallback(
    (text: string, setter: (v: boolean) => void) => {
      navigator.clipboard.writeText(text).then(() => {
        setter(true);
        setTimeout(() => setter(false), 2000);
      });
    },
    []
  );

  const addMember = () => {
    setMembers([...members, { email: '', name: '', role: 'developer' }]);
  };

  const removeMember = (index: number) => {
    setMembers(members.filter((_, i) => i !== index));
  };

  const updateMember = (
    index: number,
    field: keyof TeamMember,
    value: string
  ) => {
    const updated = [...members];
    updated[index] = { ...updated[index], [field]: value };
    setMembers(updated);
  };

  const stepLabels = ['Team', 'Share', 'GitHub', 'CLI', 'Done'];
  const stepIcons = [Users, Hash, GitBranch, Terminal, CheckCircle2];

  const inputClasses = [
    'w-full bg-bg-input border border-border-primary rounded-xl',
    'px-4 py-3 text-sm text-text-primary',
    'placeholder:text-text-muted',
    'focus:border-purple-500 focus:outline-none transition-colors',
  ].join(' ');

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center relative overflow-hidden">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-[radial-gradient(ellipse_at_center,rgba(139,92,246,0.08)_0%,transparent_70%)]" />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'linear-gradient(var(--border-primary) 1px, transparent 1px), linear-gradient(90deg, var(--border-primary) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-lg px-4 py-12">
        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            {stepLabels.map((label, i) => {
              const Icon = stepIcons[i];
              const isActive = step === i + 1;
              const isDone = step > i + 1;
              return (
                <div key={label} className="flex flex-col items-center gap-1.5">
                  <div
                    className={`h-9 w-9 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-300 ${
                      isDone
                        ? 'bg-purple-600 text-white'
                        : isActive
                          ? 'bg-purple-600/20 border-2 border-purple-500 text-purple-400'
                          : 'bg-bg-elevated text-text-muted border border-border-primary'
                    }`}
                  >
                    {isDone ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </div>
                  <span
                    className={`text-[10px] font-medium ${
                      isActive ? 'text-purple-400' : isDone ? 'text-text-secondary' : 'text-text-muted'
                    }`}
                  >
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="h-1 bg-bg-elevated rounded-full overflow-hidden">
            <div
              className="h-full bg-linear-to-r from-purple-600 to-purple-400 rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Card */}
        <div className="bg-white/3 backdrop-blur-sm border border-border-primary rounded-2xl p-8">
          {/* ── Step 1: Create or Join Team ── */}
          {step === 1 && !mode && (
            <div className="animate-[slideUp_0.4s_ease-out]">
              <h2 className="text-2xl font-bold tracking-tight mb-2">
                Get Started
              </h2>
              <p className="text-sm text-text-secondary mb-8">
                Create a new team or join an existing one.
              </p>

              <div className="space-y-3">
                <button
                  onClick={() => setMode('create')}
                  className="w-full flex items-center gap-4 p-4 rounded-xl border border-border-primary bg-bg-card hover:border-purple-500/50 hover:bg-bg-elevated transition-all text-left group"
                >
                  <div className="h-10 w-10 rounded-lg bg-purple-600/20 border border-purple-500/30 flex items-center justify-center shrink-0">
                    <Plus className="h-5 w-5 text-purple-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-text-primary">Create a new team</p>
                    <p className="text-xs text-text-muted">Set up a workspace for your engineering team</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-text-muted ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>

                <button
                  onClick={() => setMode('join')}
                  className="w-full flex items-center gap-4 p-4 rounded-xl border border-border-primary bg-bg-card hover:border-purple-500/50 hover:bg-bg-elevated transition-all text-left group"
                >
                  <div className="h-10 w-10 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center shrink-0">
                    <UserPlus className="h-5 w-5 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-text-primary">Join an existing team</p>
                    <p className="text-xs text-text-muted">Enter a team code shared by your manager</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-text-muted ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              </div>
            </div>
          )}

          {/* ── Step 1a: Create Team ── */}
          {step === 1 && mode === 'create' && (
            <div className="animate-[slideUp_0.4s_ease-out]">
              <h2 className="text-2xl font-bold tracking-tight mb-2">
                Create Your Team
              </h2>
              <p className="text-sm text-text-secondary mb-8">
                Give your team a name to get started.
              </p>

              {error && (
                <div className="flex items-center gap-2 bg-red-900/20 border border-red-800/50 rounded-lg px-4 py-3 text-red-300 text-sm mb-4">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-text-secondary mb-1.5 block">
                    Team Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Acme Engineering"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    className={inputClasses}
                    autoFocus
                  />
                </div>
                {teamName && (
                  <p className="text-xs text-text-muted">
                    Slug: <span className="font-mono text-purple-400">{slug}</span>
                  </p>
                )}
              </div>

              <div className="flex gap-3 mt-8">
                <button
                  onClick={() => { setMode(null); setError(''); }}
                  className="h-10 w-10 shrink-0 flex items-center justify-center border border-border-primary bg-white/3 rounded-xl text-text-muted hover:text-text-primary hover:bg-white/6 transition-all"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={handleCreateTeam}
                  disabled={!teamName.trim() || loading}
                  className="flex-1 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl px-6 py-3 text-sm font-semibold transition-all"
                >
                  {loading ? 'Creating...' : 'Create Team'}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* ── Step 1b: Join Team ── */}
          {step === 1 && mode === 'join' && (
            <div className="animate-[slideUp_0.4s_ease-out]">
              <h2 className="text-2xl font-bold tracking-tight mb-2">
                Join a Team
              </h2>
              <p className="text-sm text-text-secondary mb-8">
                Enter the team code shared by your manager.
              </p>

              {(error || lookupError) && (
                <div className="flex items-center gap-2 bg-red-900/20 border border-red-800/50 rounded-lg px-4 py-3 text-red-300 text-sm mb-4">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error || lookupError}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-text-secondary mb-1.5 block">
                    Team Code
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. ACME-7X3K"
                      value={joinCode}
                      onChange={(e) => {
                        setJoinCode(e.target.value.toUpperCase());
                        setFoundTeam(null);
                        setLookupError('');
                      }}
                      className={inputClasses}
                      autoFocus
                    />
                    <button
                      onClick={handleLookupTeam}
                      disabled={!joinCode.trim() || lookupLoading}
                      className="shrink-0 flex items-center justify-center gap-2 bg-bg-elevated border border-border-primary hover:border-border-hover disabled:opacity-50 rounded-xl px-4 py-3 text-sm text-text-secondary transition-all"
                    >
                      {lookupLoading ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-purple-400/30 border-t-purple-400" />
                      ) : (
                        <Search className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {foundTeam && (
                  <div className="bg-green-900/10 border border-green-800/30 rounded-xl p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-green-600/20 border border-green-500/30 flex items-center justify-center shrink-0">
                        <Users className="h-5 w-5 text-green-400" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-text-primary">{foundTeam.name}</p>
                        <p className="text-xs text-text-muted">
                          {foundTeam.memberCount} member{foundTeam.memberCount !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <CheckCircle2 className="h-5 w-5 text-green-400 ml-auto" />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3 mt-8">
                <button
                  onClick={() => { setMode(null); setError(''); setLookupError(''); setFoundTeam(null); }}
                  className="h-10 w-10 shrink-0 flex items-center justify-center border border-border-primary bg-white/3 rounded-xl text-text-muted hover:text-text-primary hover:bg-white/6 transition-all"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={handleJoinTeam}
                  disabled={!foundTeam || loading}
                  className="flex-1 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl px-6 py-3 text-sm font-semibold transition-all"
                >
                  {loading ? 'Joining...' : `Join ${foundTeam?.name || 'Team'}`}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2: Share Team Code / Invite Members ── */}
          {step === 2 && (
            <div className="animate-[slideUp_0.4s_ease-out]">
              <h2 className="text-2xl font-bold tracking-tight mb-2">
                Share Your Team Code
              </h2>
              <p className="text-sm text-text-secondary mb-6">
                Share this code with developers so they can join your team.
              </p>

              {/* Team code display */}
              {teamCode && (
                <div className="bg-bg-secondary border border-border-primary rounded-xl p-4 mb-6">
                  <label className="text-xs font-medium text-text-muted mb-2 block">
                    Your Team Code
                  </label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-2xl font-mono font-bold text-purple-400 tracking-widest">
                      {teamCode}
                    </code>
                    <button
                      onClick={() => copyToClipboard(teamCode, setCopiedCode)}
                      className="h-10 w-10 shrink-0 flex items-center justify-center rounded-lg border border-border-primary text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors"
                    >
                      {copiedCode ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              )}

              {/* Optional: Add members by email */}
              <div className="border-t border-border-primary pt-6">
                <p className="text-xs font-medium text-text-secondary mb-3">
                  Or add members directly (optional)
                </p>
                <div className="space-y-3 mb-4 max-h-48 overflow-y-auto">
                  {members.map((member, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Name"
                        value={member.name}
                        onChange={(e) => updateMember(i, 'name', e.target.value)}
                        className="flex-1 min-w-0 bg-bg-input border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-purple-500 focus:outline-none"
                      />
                      <input
                        type="email"
                        placeholder="Email"
                        value={member.email}
                        onChange={(e) => updateMember(i, 'email', e.target.value)}
                        className="flex-1 min-w-0 bg-bg-input border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-purple-500 focus:outline-none"
                      />
                      <select
                        value={member.role}
                        onChange={(e) => updateMember(i, 'role', e.target.value)}
                        className="bg-bg-input border border-border-primary rounded-lg px-2 py-2 text-xs text-text-secondary focus:border-purple-500 focus:outline-none"
                      >
                        <option value="developer">Dev</option>
                        <option value="manager">Manager</option>
                      </select>
                      {members.length > 1 && (
                        <button
                          onClick={() => removeMember(i)}
                          className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg text-text-muted hover:text-red-400 hover:bg-red-900/20 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  onClick={addMember}
                  className="flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Another
                </button>
              </div>

              <div className="flex gap-3 mt-8">
                <button
                  onClick={() => setStep(3)}
                  className="flex-1 border border-border-primary bg-white/3 text-text-secondary hover:bg-white/6 hover:text-text-primary rounded-xl px-4 py-3 text-sm font-medium transition-all"
                >
                  Skip
                </button>
                <button
                  onClick={handleInviteMembers}
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl px-4 py-3 text-sm font-semibold transition-all"
                >
                  {loading ? 'Saving...' : 'Continue'}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Connect GitHub ── */}
          {step === 3 && (
            <div className="animate-[slideUp_0.4s_ease-out]">
              <h2 className="text-2xl font-bold tracking-tight mb-2">
                Connect GitHub
              </h2>
              <p className="text-sm text-text-secondary mb-8">
                Link your GitHub organization to automatically track commits, PRs,
                and reviews.
              </p>

              <div className="flex flex-col items-center py-8">
                {githubConnected ? (
                  <div className="text-center">
                    <div className="h-14 w-14 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center mx-auto mb-4">
                      <CheckCircle2 className="h-7 w-7 text-green-400" />
                    </div>
                    <p className="text-sm font-medium text-green-400 mb-1">GitHub Connected</p>
                    <p className="text-xs text-text-muted">
                      Repositories will appear once OAuth completes.
                    </p>
                  </div>
                ) : (
                  <button
                    onClick={handleConnectGithub}
                    className="flex items-center gap-3 bg-bg-elevated border border-border-primary hover:border-border-hover rounded-xl px-8 py-4 transition-all hover:bg-bg-card"
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="text-text-primary">
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                    </svg>
                    <span className="text-sm font-medium">Connect GitHub</span>
                  </button>
                )}
              </div>

              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => setStep(mode === 'join' ? 1 : 2)}
                  className="h-10 w-10 shrink-0 flex items-center justify-center border border-border-primary bg-white/3 rounded-xl text-text-muted hover:text-text-primary hover:bg-white/6 transition-all"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setStep(4)}
                  className={`flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all ${
                    githubConnected
                      ? 'bg-purple-600 hover:bg-purple-500 text-white'
                      : 'border border-border-primary bg-white/3 text-text-secondary hover:bg-white/6'
                  }`}
                >
                  {githubConnected ? 'Continue' : 'Skip'}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* ── Step 4: Install CLI ── */}
          {step === 4 && (
            <div className="animate-[slideUp_0.4s_ease-out]">
              <h2 className="text-2xl font-bold tracking-tight mb-2">
                Install the CLI
              </h2>
              <p className="text-sm text-text-secondary mb-8">
                Run this on your machine. It installs the CLI, opens a browser to
                authenticate, and registers the Claude Code hooks.
              </p>

              <div>
                <label className="text-xs font-medium text-text-muted mb-1.5 block">
                  Setup command
                </label>
                <div className="flex items-center gap-2 bg-bg-secondary border border-border-primary rounded-xl px-4 py-3">
                  <code className="flex-1 text-sm font-mono text-purple-400 break-all">
                    {setupOneLiner}
                  </code>
                  <button
                    onClick={() => copyToClipboard(setupOneLiner, setCopiedSetup)}
                    className="h-8 w-8 shrink-0 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors"
                    title="Copy command"
                  >
                    {copiedSetup ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
                <p className="text-xs text-text-muted mt-2">
                  Need a headless install (CI, Docker)? Generate an API token from
                  <span className="text-text-secondary"> Profile → CLI &amp; API Keys </span>
                  and run <code className="font-mono text-text-secondary">evalai setup --token &lt;key&gt;</code>.
                </p>
              </div>

              <div className="flex gap-3 mt-8">
                <button
                  onClick={() => setStep(mode === 'join' ? 1 : 3)}
                  className="h-10 w-10 shrink-0 flex items-center justify-center border border-border-primary bg-white/3 rounded-xl text-text-muted hover:text-text-primary hover:bg-white/6 transition-all"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setStep(5)}
                  className="flex-1 border border-border-primary bg-white/3 text-text-secondary hover:bg-white/6 hover:text-text-primary rounded-xl px-4 py-3 text-sm font-medium transition-all"
                >
                  I&apos;ll do this later
                </button>
                <button
                  onClick={() => setStep(5)}
                  className="flex-1 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl px-4 py-3 text-sm font-semibold transition-all"
                >
                  Done
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* ── Step 5: All Set ── */}
          {step === 5 && (
            <div className="animate-[slideUp_0.4s_ease-out] text-center">
              <div className="h-16 w-16 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="h-8 w-8 text-green-400" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight mb-2">
                You&apos;re All Set!
              </h2>
              <p className="text-sm text-text-secondary mb-8">
                Your workspace is ready. Here&apos;s a summary:
              </p>

              <div className="bg-bg-secondary border border-border-primary rounded-xl p-5 text-left space-y-3 mb-8">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-muted">Team</span>
                  <span className="text-sm font-medium">{teamName}</span>
                </div>
                {teamCode && (
                  <>
                    <div className="h-px bg-border-primary" />
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-text-muted">Team Code</span>
                      <code className="text-sm font-mono text-purple-400">{teamCode}</code>
                    </div>
                  </>
                )}
                <div className="h-px bg-border-primary" />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-muted">Mode</span>
                  <span className="text-sm font-medium">
                    {mode === 'create' ? 'Created new team' : 'Joined existing team'}
                  </span>
                </div>
                <div className="h-px bg-border-primary" />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-muted">GitHub</span>
                  <span className={`text-sm font-medium ${githubConnected ? 'text-green-400' : 'text-text-muted'}`}>
                    {githubConnected ? 'Connected' : 'Not connected'}
                  </span>
                </div>
              </div>

              <button
                onClick={() => router.push('/dashboard')}
                className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl px-6 py-3.5 text-sm font-semibold transition-all shadow-[0_0_20px_rgba(139,92,246,0.3)]"
              >
                Go to Dashboard
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* Step counter */}
        <p className="text-center text-xs text-text-muted mt-4">
          Step {step} of {TOTAL_STEPS}
        </p>
      </div>
    </div>
  );
}
