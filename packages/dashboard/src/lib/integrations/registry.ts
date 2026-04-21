/**
 * Provider registry — the single lookup for "what integrations this
 * platform supports." Routes do `PROVIDERS[slug]` and delegate; they never
 * if/else on the provider string.
 *
 * To add a new provider: implement ./providers/<slug>.ts, add it here, and
 * insert a row into the `providers` table.
 */

import type { ProviderAdapter } from './provider';
import type { ProviderSlug } from './types';
import { githubAdapter } from './providers/github';
import { firefliesAdapter } from './providers/fireflies';

export const PROVIDERS: Readonly<Record<ProviderSlug, ProviderAdapter>> = Object.freeze({
  github: githubAdapter,
  fireflies: firefliesAdapter,
});

/** Type guard for request params. */
export function isProviderSlug(value: unknown): value is ProviderSlug {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(PROVIDERS, value);
}

/** Returns the adapter, or throws a descriptive error if the slug is unknown. */
export function getProvider(slug: string): ProviderAdapter {
  if (!isProviderSlug(slug)) {
    throw new Error(`Unknown provider: ${slug}. Known: ${Object.keys(PROVIDERS).join(', ')}`);
  }
  return PROVIDERS[slug];
}
