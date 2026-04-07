'use client';

import { useState, useEffect } from "react";
import { Inter } from "next/font/google";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Calendar,
  CheckSquare,
  Plug,
  FileText,
  Bell,
  Settings,
  RefreshCw,
  Sun,
  Moon,
  LogOut,
  User,
} from "lucide-react";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/developers", label: "Developers", icon: Users },
  { href: "/dashboard/meetings", label: "Meetings", icon: Calendar },
  { href: "/dashboard/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/dashboard/integrations", label: "Integrations", icon: Plug },
  { href: "/dashboard/reports", label: "Reports", icon: FileText },
  { href: "/dashboard/alerts", label: "Alerts", icon: Bell },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const router = useRouter();
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [currentUser, setCurrentUser] = useState<{ name: string; email: string } | null>(null);

  const isAuthPage = pathname.startsWith('/auth');

  useEffect(() => {
    const saved = localStorage.getItem('evaluateai-theme') as 'dark' | 'light' | null;
    if (saved) setTheme(saved);
  }, []);

  useEffect(() => {
    // Load user from localStorage (MVP auth)
    try {
      const stored = localStorage.getItem('evaluateai-user');
      if (stored) {
        setCurrentUser(JSON.parse(stored));
      } else if (!isAuthPage) {
        // Redirect to login if not authenticated and not already on auth page
        router.push('/auth/login');
      }
    } catch {
      // Parse error — redirect to login
      if (!isAuthPage) {
        router.push('/auth/login');
      }
    }
  }, [pathname, isAuthPage, router]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('evaluateai-theme', theme);
  }, [theme]);

  const handleLogout = () => {
    localStorage.removeItem('evaluateai-user');
    localStorage.removeItem('evaluateai-session');
    localStorage.removeItem('evaluateai-team');
    setCurrentUser(null);
    window.location.href = '/auth/login';
  };

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`} data-theme={theme}>
      <head>
        <title>EvaluateAI</title>
        <meta name="description" content="AI coding assistant evaluation dashboard" />
      </head>
      <body className="min-h-full flex bg-[var(--bg-primary)] text-[var(--text-primary)]">
        {isAuthPage ? (
          /* Auth pages: no sidebar, just render children */
          <main className="flex-1 min-h-screen">
            {children}
          </main>
        ) : (
          <>
            {/* Sidebar */}
            <aside className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-[var(--border-primary)] bg-[var(--bg-card)]">
              {/* Logo + Theme Toggle */}
              <div className="flex h-14 items-center justify-between px-5 border-b border-[var(--border-primary)]">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#8b5cf6] to-[#6d28d9] flex items-center justify-center shadow-[0_0_12px_rgba(139,92,246,0.3)]">
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
                  <span className="text-[15px] font-semibold tracking-tight text-[var(--text-primary)]">
                    Evaluate<span className="text-[#8b5cf6]">AI</span>
                  </span>
                </div>
                <button
                  onClick={toggleTheme}
                  className="h-8 w-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-all duration-200"
                  title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
                >
                  {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>
              </div>

              {/* Navigation */}
              <nav className="flex-1 flex flex-col gap-0.5 px-3 py-4">
                {navItems.map(({ href, label, icon: Icon }) => {
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
                            ? "bg-white/[0.06] text-[var(--text-primary)]"
                            : "text-[var(--text-muted)] hover:bg-white/[0.04] hover:text-[var(--text-secondary)]"
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
              </nav>

              {/* Bottom section */}
              <div className="border-t border-[var(--border-primary)] px-4 py-3 space-y-2">
                {/* User info */}
                {currentUser && (
                  <div className="flex items-center gap-3 px-1 py-2">
                    <div className="h-7 w-7 rounded-full bg-purple-600/20 border border-purple-500/30 flex items-center justify-center shrink-0">
                      <User className="h-3.5 w-3.5 text-purple-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-[var(--text-primary)] truncate">
                        {currentUser.name}
                      </p>
                      <p className="text-[10px] text-[var(--text-muted)] truncate">
                        {currentUser.email}
                      </p>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="h-6 w-6 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-red-400 hover:bg-red-900/20 transition-colors"
                      title="Sign out"
                    >
                      <LogOut className="h-3 w-3" />
                    </button>
                  </div>
                )}

                <button
                  className="flex w-full items-center justify-center gap-2 rounded-md border border-[var(--border-primary)] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-white/[0.06] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)]"
                  onClick={() => window.location.reload()}
                >
                  <RefreshCw className="h-3 w-3" />
                  Sync Now
                </button>
                <p className="text-center text-[10px] text-[var(--text-muted)] tracking-wide uppercase">
                  v1.0.0
                </p>
              </div>
            </aside>

            {/* Main content */}
            <main className="ml-60 flex-1 min-h-screen relative">
              {/* Purple gradient top border */}
              <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-[#8b5cf6]/50 via-[#8b5cf6]/20 to-transparent" />

              {/* Atmospheric purple glow */}
              <div className="pointer-events-none absolute top-0 left-0 w-[600px] h-[400px] bg-[radial-gradient(ellipse_at_top_left,rgba(139,92,246,0.06)_0%,transparent_70%)]" />

              <div className="relative px-8 py-6">
                {children}
              </div>
            </main>
          </>
        )}
      </body>
    </html>
  );
}
