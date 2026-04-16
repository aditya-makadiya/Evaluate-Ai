'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

export interface AdminUser {
  userId: string;
  email: string;
  name: string;
  platformRole: 'admin' | 'super_admin';
}

interface AdminAuthState {
  adminUser: AdminUser | null;
  isAdmin: boolean;
  loading: boolean;
}

const AdminAuthContext = createContext<AdminAuthState>({
  adminUser: null,
  isAdmin: false,
  loading: true,
});

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function checkAdmin() {
      try {
        const res = await fetch('/api/admin/me');
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setAdminUser(data);
        } else {
          if (!cancelled) {
            setAdminUser(null);
            router.push('/dashboard');
          }
        }
      } catch {
        if (!cancelled) {
          setAdminUser(null);
          router.push('/dashboard');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    checkAdmin();
    return () => { cancelled = true; };
  }, [router]);

  return (
    <AdminAuthContext.Provider value={{ adminUser, isAdmin: !!adminUser, loading }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth(): AdminAuthState {
  return useContext(AdminAuthContext);
}
