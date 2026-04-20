'use client';

import { useState, useEffect } from "react";
import { Inter } from "next/font/google";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  UsersRound,
  Calendar,
  CheckSquare,
  Plug,
  FileText,
  Bell,
  Settings,
  BookOpen,
  Lightbulb,
  RefreshCw,
  Sun,
  Moon,
  LogOut,
  User,
  Shield,
} from "lucide-react";
import { AuthProvider, useAuth, useCanAccess } from "@/components/auth-provider";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/developers", label: "Developers", icon: Users },
  { href: "/dashboard/team", label: "Team", icon: UsersRound },
  { href: "/dashboard/meetings", label: "Meetings", icon: Calendar },
  { href: "/dashboard/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/dashboard/integrations", label: "Integrations", icon: Plug },
  { href: "/dashboard/reports", label: "Reports", icon: FileText },
  { href: "/dashboard/insights", label: "Insights", icon: Lightbulb },
  { href: "/dashboard/alerts", label: "Alerts", icon: Bell },
  { href: "/docs", label: "Docs", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: Settings },
];

// Nav items that only owners/managers can see
const MANAGER_ONLY_HREFS = new Set([
  '/dashboard/meetings',
  '/dashboard/reports',
  '/dashboard/insights',
  '/dashboard/alerts',
  '/settings',
]);

type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const isManagerOrOwner = useCanAccess('owner', 'manager');
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') return 'dark';
    return (localStorage.getItem('evaluateai-theme') as 'dark' | 'light') ?? 'dark';
  });
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [syncMessage, setSyncMessage] = useState('');

  // Platform admin status comes from /api/auth/me now — no separate probe.
  // Previously this ran a useEffect fetching /api/admin/me on every `user`
  // reference change, which re-fired on every auth refresh and returned 403
  // for non-admin accounts (spamming the network tab for developers).
  const isPlatformAdmin = !!user?.isPlatformAdmin;

  const isAuthPage = pathname.startsWith('/auth');
  const isMarketingPage = pathname === '/';
  const isOnboarding = pathname.startsWith('/onboarding');
  const isAdminPage = pathname.startsWith('/admin');
  const isPublicPage = isAuthPage || isMarketingPage || isOnboarding;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('evaluateai-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  const handleSync = async () => {
    if (syncStatus === 'syncing') return;
    setSyncStatus('syncing');
    setSyncMessage('');

    try {
      const res = await fetch('/api/dashboard/generate-reports', { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        setSyncStatus('error');
        setSyncMessage(data.error ?? 'Sync failed');
        return;
      }

      const parts: string[] = [];
      if (data.reportsGenerated > 0) parts.push(`${data.reportsGenerated} reports`);
      if (data.alertsGenerated > 0) parts.push(`${data.alertsGenerated} alerts`);
      if (data.staleSessionsClosed > 0) parts.push(`${data.staleSessionsClosed} stale sessions cleaned`);
      if (data.summariesBackfilled > 0) parts.push(`${data.summariesBackfilled} session summaries generated`);

      setSyncStatus('success');
      setSyncMessage(parts.length > 0 ? `Generated ${parts.join(', ')}` : 'Up to date — no new data');

      // Auto-clear success toast after 4 seconds
      setTimeout(() => {
        setSyncStatus((prev) => (prev === 'success' ? 'idle' : prev));
        setSyncMessage('');
      }, 4000);
    } catch {
      setSyncStatus('error');
      setSyncMessage('Network error — please try again');
    }
  };

  if (isPublicPage || isAdminPage) {
    return <main className="flex-1 min-h-screen">{children}</main>;
  }

  return (
    <>
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-border-primary bg-bg-card">
        {/* Logo + Theme Toggle */}
        <div className="flex h-14 items-center justify-between px-5 border-b border-border-primary">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-linear-to-br from-[#8b5cf6] to-[#6d28d9] flex items-center justify-center shadow-[0_0_12px_rgba(139,92,246,0.3)]">
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                className="text-white"
              >
                <path
                  d="M8 1L14.5 5v6L8 15 1.5 11V5L8 1z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                  fill="rgba(255,255,255,0.15)"
                />
                <path
                  d="M8 5.5L11.5 7.5v3L8 12.5 4.5 10.5v-3L8 5.5z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                  fill="rgba(255,255,255,0.25)"
                />
              </svg>
            </div>
            <span className="text-[15px] font-semibold tracking-tight text-text-primary">
              Evaluate<span className="text-[#8b5cf6]">AI</span>
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

        {/* Navigation */}
        <nav className="flex-1 flex flex-col gap-0.5 px-3 py-4">
          {navItems.filter(({ href }) => isManagerOrOwner || !MANAGER_ONLY_HREFS.has(href)).map(({ href, label, icon: Icon }) => {
            const isActive =
              href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(href) && href !== "/dashboard";

            return (
              <Link
                key={href}
                href={href}
                className={`
                  group relative flex items-center gap-3 rounded-md px-3 py-2 text-[13px] font-medium transition-all duration-150
                  ${
                    isActive
                      ? "bg-white/6 text-text-primary"
                      : "text-text-muted hover:bg-white/4 hover:text-text-secondary"
                  }
                `}
              >
                {/* Active indicator bar */}
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-[#8b5cf6]" />
                )}
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            );
          })}

          {/* Admin Panel link — only visible to platform admins */}
          {isPlatformAdmin && (
            <>
              <div className="mx-2 my-2 h-px bg-border-primary" />
              <Link
                href="/admin"
                className="group relative flex items-center gap-3 rounded-md px-3 py-2 text-[13px] font-medium transition-all duration-150 bg-red-900/20 border border-red-500/20 text-red-400 hover:bg-red-900/30 hover:border-red-500/30 hover:text-red-300"
              >
                <Shield className="h-4 w-4 shrink-0" />
                Admin Panel
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
              </Link>
            </>
          )}
        </nav>

        {/* Bottom section */}
        <div className="border-t border-border-primary px-4 py-3 space-y-2">
          {/* User info */}
          {user && (
            <div className="flex items-center gap-3 px-1 py-2">
              <Link href="/profile" className="flex items-center gap-3 flex-1 min-w-0 group">
                <div className="h-7 w-7 rounded-full bg-purple-600/20 border border-purple-500/30 flex items-center justify-center shrink-0 group-hover:border-purple-400/50 transition-colors">
                  <User className="h-3.5 w-3.5 text-purple-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-text-primary truncate group-hover:text-purple-400 transition-colors">
                    {user.name}
                  </p>
                  <p className="text-[10px] text-text-muted truncate">
                    {user.email}
                  </p>
                </div>
              </Link>
              <button
                onClick={signOut}
                className="h-6 w-6 rounded flex items-center justify-center text-text-muted hover:text-red-400 hover:bg-red-900/20 transition-colors"
                title="Sign out"
              >
                <LogOut className="h-3 w-3" />
              </button>
            </div>
          )}

          {isManagerOrOwner ? (
            <button
              className={`flex w-full items-center justify-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                syncStatus === 'syncing'
                  ? 'border-purple-500/30 bg-purple-900/20 text-purple-300 cursor-wait'
                  : syncStatus === 'success'
                    ? 'border-emerald-500/30 bg-emerald-900/20 text-emerald-300'
                    : syncStatus === 'error'
                      ? 'border-red-500/30 bg-red-900/20 text-red-300 hover:bg-red-900/30'
                      : 'border-border-primary bg-white/3 text-text-secondary hover:bg-white/6 hover:text-text-primary hover:border-border-hover'
              }`}
              onClick={handleSync}
              disabled={syncStatus === 'syncing'}
            >
              <RefreshCw className={`h-3 w-3 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
              {syncStatus === 'syncing' ? 'Generating...' : syncStatus === 'success' ? 'Synced' : syncStatus === 'error' ? 'Retry Sync' : 'Sync Now'}
            </button>
          ) : (
            <button
              className="flex w-full items-center justify-center gap-2 rounded-md border border-border-primary bg-white/3 px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-white/6 hover:text-text-primary hover:border-border-hover"
              onClick={() => window.location.reload()}
            >
              <RefreshCw className="h-3 w-3" />
              Refresh
            </button>
          )}
          {syncMessage && (
            <p className={`text-center text-[10px] leading-tight ${
              syncStatus === 'error' ? 'text-red-400' : syncStatus === 'success' ? 'text-emerald-400' : 'text-text-muted'
            }`}>
              {syncMessage}
            </p>
          )}
          <p className="text-center text-[10px] text-text-muted tracking-wide uppercase">
            v1.0.0
          </p>
        </div>
      </aside>

      {/* Main content */}
      <main className="ml-60 flex-1 min-h-screen relative">
        {/* Purple gradient top border */}
        <div className="absolute top-0 left-0 right-0 h-px bg-linear-to-r from-[#8b5cf6]/50 via-[#8b5cf6]/20 to-transparent" />

        {/* Atmospheric purple glow */}
        <div className="pointer-events-none absolute top-0 left-0 w-[600px] h-[400px] bg-[radial-gradient(ellipse_at_top_left,rgba(139,92,246,0.06)_0%,transparent_70%)]" />

        <div className="relative px-8 py-6">
          {children}
        </div>
      </main>
    </>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`} data-theme="dark">
      <head>
        <title>EvaluateAI</title>
        <meta name="description" content="AI coding assistant evaluation dashboard" />
      </head>
      <body suppressHydrationWarning className="min-h-full flex bg-bg-primary text-text-primary">
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
