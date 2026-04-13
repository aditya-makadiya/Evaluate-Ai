'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';

/**
 * /sessions is no longer a standalone page.
 * - Developers → redirect to their own developer detail page (Sessions tab)
 * - Managers/Owners → redirect to the developers list
 */
export default function SessionsRedirect() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!user) return;

    if (user.role === 'developer') {
      // Redirect developer to their own detail page
      router.replace(`/dashboard/developers/${user.memberId}`);
    } else {
      // Managers/owners go to developers list
      router.replace('/dashboard/developers');
    }
  }, [user, router]);

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center">
      <div className="animate-pulse text-sm text-text-muted">Redirecting...</div>
    </div>
  );
}
