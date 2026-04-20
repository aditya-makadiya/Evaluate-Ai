'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import type { User } from '@supabase/supabase-js';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  teamId: string;
  teamName: string;
  teamCode: string;
  role: 'owner' | 'manager' | 'developer';
  memberId: string;
  platformRole?: 'admin' | 'super_admin' | null;
  isPlatformAdmin?: boolean;
}

interface AuthState {
  user: AuthUser | null;
  supabaseUser: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  supabaseUser: null,
  loading: true,
  refresh: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [supabaseUser, setSupabaseUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  // Incremented after each fetchUserContext completes. Used as a dependency
  // in the redirect effect so it re-evaluates after every fetch, even when
  // loading was already false.
  const [fetchCount, setFetchCount] = useState(0);
  const pathname = usePathname();
  const router = useRouter();

  // Tracks in-flight fetchUserContext calls. The onboarding redirect must NOT
  // fire while a fetch is in progress — the user state may simply be "not yet loaded".
  const fetchingRef = useRef(false);

  // Track whether onboarding redirect has already happened this mount
  // to prevent repeated redirects from transient API failures.
  const hasRedirectedRef = useRef(false);

  const isPublicPage = pathname === '/' || pathname.startsWith('/auth') || pathname.startsWith('/onboarding');

  const fetchUserContext = useCallback(async () => {
    // Prevent concurrent invocations. The Supabase browser client serializes
    // auth calls through navigator.locks; two overlapping getUser() calls race
    // and the second uses steal:true, rejecting the first with an AbortError.
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const supabase = getSupabaseBrowser();
      const { data: { user: sbUser } } = await supabase.auth.getUser();

      if (!sbUser) {
        setUser(null);
        setSupabaseUser(null);
        return;
      }

      setSupabaseUser(sbUser);

      // Fetch team membership via API
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else if (res.status === 401) {
        // User exists in Supabase but has no team membership — genuine onboarding case
        setUser(null);
      }
      // For 500 / network errors: keep existing user state to avoid false redirect.
      // The next fetchUserContext call (token refresh, tab focus) will retry.
    } catch (err) {
      // AbortError from navigator.locks ("Lock broken by another request with
      // the 'steal' option") is benign — a newer call took over; let it finish.
      if (!(err instanceof Error) || err.name !== 'AbortError') {
        // Other errors: keep existing state to avoid a false onboarding redirect
        // on transient network failures.
      }
    } finally {
      fetchingRef.current = false;
      setLoading(false);
      setFetchCount(c => c + 1);
    }
  }, []);

  useEffect(() => {
    fetchUserContext();

    const supabase = getSupabaseBrowser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // INITIAL_SESSION fires immediately on subscribe with the current session.
      // The initial fetchUserContext() above already handles it; skipping here
      // avoids a concurrent auth.getUser() that would race the Web-Locks-based
      // auth client and trigger an AbortError on lock steal.
      if (event === 'INITIAL_SESSION') return;

      if (!session) {
        // Only clear state if no fetch is in progress. During initialization,
        // onAuthStateChange may fire with null before getUser() resolves.
        if (!fetchingRef.current) {
          setUser(null);
          setSupabaseUser(null);
          setLoading(false);
        }
      } else {
        fetchUserContext();
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchUserContext]);

  // Redirect authenticated users without a team to onboarding.
  // Guards:
  // - loading must be false (initial load done)
  // - fetchingRef must be false (no API call in flight)
  // - must not be on a public page already
  // - must not have already redirected this mount
  // - fetchCount dependency ensures re-evaluation after each fetch completes
  useEffect(() => {
    if (loading || isPublicPage) return;
    if (fetchingRef.current) return;
    if (hasRedirectedRef.current) return;
    if (supabaseUser && !user) {
      hasRedirectedRef.current = true;
      router.push('/onboarding');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, isPublicPage, supabaseUser, user, router, fetchCount]);

  // Reset redirect flag when user successfully loads (e.g., after completing onboarding)
  useEffect(() => {
    if (user) {
      hasRedirectedRef.current = false;
    }
  }, [user]);

  const signOut = useCallback(async () => {
    const supabase = getSupabaseBrowser();
    await supabase.auth.signOut();
    setUser(null);
    setSupabaseUser(null);
    hasRedirectedRef.current = false;
    window.location.href = '/auth/login';
  }, []);

  return (
    <AuthContext.Provider value={{ user, supabaseUser, loading, refresh: fetchUserContext, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook to access the authenticated user's context.
 * Returns user=null if not authenticated or has no team.
 */
export function useAuth(): AuthState {
  return useContext(AuthContext);
}

/**
 * Hook to check if the current user has one of the specified roles.
 */
export function useCanAccess(...roles: string[]): boolean {
  const { user } = useAuth();
  if (!user) return false;
  return roles.includes(user.role);
}
