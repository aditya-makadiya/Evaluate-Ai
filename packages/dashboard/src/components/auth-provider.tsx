'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
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
  const pathname = usePathname();
  const router = useRouter();

  const isPublicPage = pathname === '/' || pathname.startsWith('/auth') || pathname.startsWith('/onboarding');

  const fetchUserContext = useCallback(async () => {
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
      } else {
        // User exists but no team membership
        setUser(null);
      }
    } catch {
      setUser(null);
      setSupabaseUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUserContext();

    const supabase = getSupabaseBrowser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setUser(null);
        setSupabaseUser(null);
        setLoading(false);
      } else {
        fetchUserContext();
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchUserContext]);

  // Redirect authenticated users without a team to onboarding
  useEffect(() => {
    if (loading || isPublicPage) return;
    if (supabaseUser && !user) {
      router.push('/onboarding');
    }
  }, [loading, isPublicPage, supabaseUser, user, router]);

  const signOut = useCallback(async () => {
    const supabase = getSupabaseBrowser();
    await supabase.auth.signOut();
    setUser(null);
    setSupabaseUser(null);
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
