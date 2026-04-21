/**
 * Compact relative-time formatter for "last synced N ago" indicators.
 *
 * Intentionally small and deterministic — no Intl.RelativeTimeFormat
 * round-tripping, no locale pluralization. The "5m" / "2h" / "3d" shape is
 * part of the visual language and should stay stable across the app.
 */

export function formatTimeAgo(input: string | Date | null | undefined, now: Date = new Date()): string {
  if (!input) return 'never';
  const then = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(then.getTime())) return 'never';

  const diffMs = now.getTime() - then.getTime();
  if (diffMs < 0) return 'just now';

  const s = Math.floor(diffMs / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  const y = Math.floor(d / 365);
  return `${y}y ago`;
}
