import { describe, it, expect } from 'vitest';
import { formatTimeAgo } from '../time-ago';

const NOW = new Date('2026-04-21T12:00:00Z');

describe('formatTimeAgo', () => {
  it("returns 'never' for null/undefined/invalid", () => {
    expect(formatTimeAgo(null)).toBe('never');
    expect(formatTimeAgo(undefined)).toBe('never');
    expect(formatTimeAgo('not a date')).toBe('never');
  });

  it("returns 'just now' for <10s", () => {
    expect(formatTimeAgo(new Date(NOW.getTime() - 5000), NOW)).toBe('just now');
    expect(formatTimeAgo(new Date(NOW.getTime() + 1000), NOW)).toBe('just now');
  });

  it('returns seconds ago', () => {
    expect(formatTimeAgo(new Date(NOW.getTime() - 30_000), NOW)).toBe('30s ago');
  });

  it('returns minutes ago', () => {
    expect(formatTimeAgo(new Date(NOW.getTime() - 5 * 60_000), NOW)).toBe('5m ago');
  });

  it('returns hours ago', () => {
    expect(formatTimeAgo(new Date(NOW.getTime() - 2 * 60 * 60_000), NOW)).toBe('2h ago');
  });

  it('returns days ago', () => {
    expect(formatTimeAgo(new Date(NOW.getTime() - 3 * 24 * 60 * 60_000), NOW)).toBe('3d ago');
  });

  it('returns months / years ago for longer intervals', () => {
    expect(formatTimeAgo(new Date(NOW.getTime() - 45 * 24 * 60 * 60_000), NOW)).toBe('1mo ago');
    expect(formatTimeAgo(new Date(NOW.getTime() - 400 * 24 * 60 * 60_000), NOW)).toBe('1y ago');
  });
});
