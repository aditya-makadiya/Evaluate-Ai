'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  UsersRound,
  GitBranch,
  DollarSign,
  CheckSquare,
  Users,
  ArrowLeft,
  Sun,
  Moon,
  Shield,
  Activity,
} from 'lucide-react';
import { AdminAuthProvider, useAdminAuth } from '@/components/admin/admin-auth-provider';
import { AdminTeamProvider, useAdminTeamFilter } from '@/components/admin/admin-team-context';
import { AdminTeamFilter } from '@/components/admin/admin-team-filter';

const adminNavItems = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard },
  { href: '/admin/teams', label: 'Teams', icon: UsersRound },
  { href: '/admin/sessions', label: 'Sessions', icon: Activity },
  { href: '/admin/github', label: 'GitHub Activity', icon: GitBranch },
  { href: '/admin/costs', label: 'AI Costs', icon: DollarSign },
  { href: '/admin/tasks', label: 'Tasks', icon: CheckSquare },
  { href: '/admin/users', label: 'Users', icon: Users },
];

function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { adminUser, loading } = useAdminAuth();
  const { teamId, setTeamId } = useAdminTeamFilter();
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') return 'dark';
    return (localStorage.getItem('evaluateai-theme') as 'dark' | 'light') ?? 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('evaluateai-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-primary">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
          <p className="text-sm text-text-muted">Verifying admin access...</p>
        </div>
      </div>
    );
  }

  if (!adminUser) return null;

  return (
    <>
      {/* Admin Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-border-primary bg-bg-card">
        {/* Logo + Theme Toggle */}
        <div className="flex h-14 items-center justify-between px-5 border-b border-border-primary">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-linear-to-br from-red-500 to-red-700 flex items-center justify-center shadow-[0_0_12px_rgba(239,68,68,0.3)]">
              <Shield className="h-4 w-4 text-white" />
            </div>
            <span className="text-[15px] font-semibold tracking-tight text-text-primary">
              Admin<span className="text-red-400">Panel</span>
            </span>
          </div>
          <button
            onClick={toggleTheme}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-all duration-200"
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>

        {/* Team Filter */}
        <div className="px-3 py-3 border-b border-border-primary">
          <AdminTeamFilter value={teamId} onChange={setTeamId} />
        </div>

        {/* Navigation */}
        <nav className="flex-1 flex flex-col gap-0.5 px-3 py-4">
          {adminNavItems.map(({ href, label, icon: Icon }) => {
            const isActive =
              href === '/admin'
                ? pathname === '/admin'
                : pathname.startsWith(href) && href !== '/admin';

            return (
              <Link
                key={href}
                href={href}
                className={`group relative flex items-center gap-3 rounded-md px-3 py-2 text-[13px] font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-white/6 text-text-primary'
                    : 'text-text-muted hover:bg-white/4 hover:text-text-secondary'
                }`}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-red-400" />
                )}
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Bottom section */}
        <div className="border-t border-border-primary px-4 py-3 space-y-2">
          {adminUser && (
            <div className="flex items-center gap-3 px-1 py-2">
              <div className="h-7 w-7 rounded-full bg-red-600/20 border border-red-500/30 flex items-center justify-center shrink-0">
                <Shield className="h-3.5 w-3.5 text-red-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-text-primary truncate">
                  {adminUser.name}
                </p>
                <p className="text-[10px] text-text-muted truncate">
                  {adminUser.platformRole}
                </p>
              </div>
            </div>
          )}

          <Link
            href="/dashboard"
            className="flex w-full items-center justify-center gap-2 rounded-md border border-border-primary bg-white/3 px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-white/6 hover:text-text-primary hover:border-border-hover"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to Dashboard
          </Link>

          <p className="text-center text-[10px] text-text-muted tracking-wide uppercase">
            Admin Panel
          </p>
        </div>
      </aside>

      {/* Main content */}
      <main className="ml-60 flex-1 min-h-screen relative">
        <div className="absolute top-0 left-0 right-0 h-px bg-linear-to-r from-red-500/50 via-red-500/20 to-transparent" />
        <div className="pointer-events-none absolute top-0 left-0 w-[600px] h-[400px] bg-[radial-gradient(ellipse_at_top_left,rgba(239,68,68,0.06)_0%,transparent_70%)]" />
        <div className="relative px-8 py-6">
          {children}
        </div>
      </main>
    </>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminAuthProvider>
      <AdminTeamProvider>
        <AdminShell>{children}</AdminShell>
      </AdminTeamProvider>
    </AdminAuthProvider>
  );
}
