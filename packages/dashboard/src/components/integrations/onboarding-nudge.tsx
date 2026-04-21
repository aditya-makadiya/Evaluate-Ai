'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Github, Mic, X, Sparkles } from 'lucide-react';

export interface OnboardingNudgeProps {
  teamId: string;
  currentUserId: string;
}

interface StatusPayload {
  flow: 'v2' | 'legacy';
  providers: Record<
    'github' | 'fireflies',
    {
      members?: Array<{ userId: string; status: string }>;
    }
  >;
}

/**
 * Dismissible banner shown to developers under a v2 team who haven't
 * connected any integration yet. Dismissal persists in localStorage keyed
 * by team so nagging stays off across sessions.
 *
 * Styled for dark theme — subtle purple-tinted card matching the app's
 * accent palette.
 */
export function OnboardingNudge({ teamId, currentUserId }: OnboardingNudgeProps) {
  const dismissKey = `integrations-nudge:${teamId}:dismissed`;
  const [visible, setVisible] = useState(false);
  const [missingProviders, setMissingProviders] = useState<Array<'github' | 'fireflies'>>([]);

  useEffect(() => {
    let cancelled = false;
    if (typeof window !== 'undefined' && window.localStorage.getItem(dismissKey) === '1') {
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/integrations/status?team_id=${teamId}`);
        if (!res.ok) return;
        const data = (await res.json()) as StatusPayload;
        if (data.flow !== 'v2') return;
        const missing: Array<'github' | 'fireflies'> = [];
        for (const slug of ['github', 'fireflies'] as const) {
          const mine = data.providers[slug].members?.find((m) => m.userId === currentUserId);
          if (!mine || mine.status !== 'active') missing.push(slug);
        }
        if (!cancelled && missing.length > 0) {
          setMissingProviders(missing);
          setVisible(true);
        }
      } catch {
        // silent — nudge is non-critical
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [teamId, currentUserId, dismissKey]);

  if (!visible) return null;

  function handleDismiss() {
    window.localStorage.setItem(dismissKey, '1');
    setVisible(false);
  }

  return (
    <div className="mb-6 rounded-lg border border-purple-800/40 bg-purple-900/10 px-4 py-3 flex items-start justify-between gap-3">
      <div className="flex items-start gap-3 min-w-0">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-900/30 text-purple-400">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium text-text-primary">
            Connect your own accounts to improve team visibility
          </div>
          <div className="text-xs text-text-secondary mt-1 leading-relaxed">
            Commits and meetings only get attributed to you after you connect{' '}
            {missingProviders.map((p, i) => (
              <span key={p}>
                {i > 0 && i === missingProviders.length - 1 ? ' and ' : i > 0 ? ', ' : ''}
                <Link
                  href="/dashboard/integrations"
                  className="inline-flex items-center gap-1 font-medium text-purple-300 hover:text-purple-200 transition-colors"
                >
                  {p === 'github' ? (
                    <Github className="h-3 w-3" />
                  ) : (
                    <Mic className="h-3 w-3" />
                  )}
                  {p === 'github' ? 'GitHub' : 'Fireflies'}
                </Link>
              </span>
            ))}
            .
          </div>
        </div>
      </div>
      <button
        onClick={handleDismiss}
        className="shrink-0 text-text-muted hover:text-text-primary transition-colors p-1 -m-1"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
