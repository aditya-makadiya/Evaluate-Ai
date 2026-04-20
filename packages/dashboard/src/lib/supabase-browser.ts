import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

// Cache on globalThis so HMR module reloads don't spawn a second client.
// Two clients in the same tab → two Web-Locks holders → "Lock broken by steal" AbortErrors.
declare global {
  // eslint-disable-next-line no-var
  var __supabaseBrowserClient: SupabaseClient | undefined;
}

export function getSupabaseBrowser(): SupabaseClient {
  if (globalThis.__supabaseBrowserClient) return globalThis.__supabaseBrowserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase not configured — set SUPABASE_URL and SUPABASE_ANON_KEY');

  globalThis.__supabaseBrowserClient = createBrowserClient(url, key);
  return globalThis.__supabaseBrowserClient;
}
