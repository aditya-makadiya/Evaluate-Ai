# Deployment

How to take the dashboard from `localhost:3456` to a production Vercel deployment, with Supabase + Google OAuth + per-user GitHub integration wired up.

## Checklist

```
Supabase — Authentication → URL Configuration
  [ ] Site URL → https://<your-prod-domain>
  [ ] Redirect URLs add:
      - https://<your-prod-domain>/auth/callback
      - https://*.vercel.app/auth/callback      (preview deployments)
  [ ] Keep http://localhost:3456/auth/callback for dev

Supabase — Authentication → Providers
  [ ] Email: Confirm email = ON
  [ ] Google: enabled, Client ID + Secret pasted
  [ ] Allow manual linking = ON (enables /profile Connect Google)

Google Cloud Console (OAuth client used by Supabase)
  [ ] Authorized JavaScript origins: add prod + custom domain
  [ ] Authorized redirect URIs: ONLY https://<project>.supabase.co/auth/v1/callback
  [ ] OAuth consent screen published (for production users) OR test-user list kept up to date

GitHub OAuth App (for per-user GitHub integration)
  [ ] Homepage URL: https://<your-prod-domain>
  [ ] Callback URL(s): include https://<your-prod-domain>/api/integrations/github/callback
      (plus localhost variant for dev)

Vercel — Environment Variables (Production + Preview)
  [ ] NEXT_PUBLIC_SUPABASE_URL / SUPABASE_URL
  [ ] NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_ANON_KEY
  [ ] SUPABASE_SERVICE_ROLE_KEY
  [ ] EVALUATEAI_ENCRYPTION_KEY                     (identical across envs — see below)
  [ ] GITHUB_OAUTH_CLIENT_ID / SECRET
  [ ] ANTHROPIC_API_KEY                             (optional)

Deploy
  [ ] Push to main → Vercel builds + deploys automatically
  [ ] Smoke-test: /auth/login renders, Google sign-in works, integrations flow works
```

---

## Supabase setup

### URL Configuration

**Site URL** is the fallback redirect when none matches the allow list, and is used as a template variable in email templates (confirmation, password reset). In production this must be your prod domain — localhost URLs in password-reset emails are a common footgun.

**Redirect URLs** is the allow list. Supabase will refuse to redirect anywhere not on this list.

For Vercel specifically:
- Vercel gives every PR a unique preview URL (`<app>-git-<branch>-<user>.vercel.app`). Without the wildcard pattern `https://*.vercel.app/auth/callback`, OAuth breaks on every preview.
- The wildcard is restricted to subdomains of the domain after `*.` — it won't accidentally permit arbitrary origins.

### Identity linking

`Allow manual linking = ON` exposes `supabase.auth.linkIdentity()`, used by the Connected Accounts section on `/profile`. Without it, a password-signup user cannot later link Google from their profile (they can still create a new Google-signup account, but that creates a separate user).

Auto-linking by verified email is controlled by `Confirm email = ON` (which you want for other reasons too).

### Google provider

Configured separately in Supabase dashboard → Authentication → Providers → Google:
- Paste Client ID and Client Secret from the Google Cloud OAuth client
- Save

No changes to the codebase are required for Google; the button ([`GoogleSignInButton`](../packages/dashboard/src/components/auth/google-sign-in-button.tsx)) is already wired.

---

## Google Cloud Console

Open the OAuth 2.0 client you created for this app.

**Authorized JavaScript origins** — the browser origins that will initiate OAuth. Add:
- `https://<your-prod-domain>` (e.g. `https://app.evaluateai.com`)
- `https://<your-vercel-project>.vercel.app`
- Keep `http://localhost:3456` for dev

Google does not support wildcards in JavaScript origins, so Vercel preview deployments cannot use Google OAuth unless each preview domain is added manually. For preview testing, use email + password.

**Authorized redirect URIs** — where Google sends the user after consent. This is ONLY the Supabase callback URL:
```
https://<project-ref>.supabase.co/auth/v1/callback
```
The flow is Google → Supabase → your app (via `/auth/callback` with the exchanged session). Google never redirects directly to your app.

**OAuth consent screen** — while in Testing mode, only listed test users can sign in. Publish the app (Production) for general availability. For basic email/profile scopes no verification review is required.

---

## GitHub OAuth App

This is separate from Google — it's the OAuth client used by the per-user GitHub integration on the `/dashboard/integrations` page. Configure in GitHub → Settings → Developer Settings → OAuth Apps.

**Callback URL** must match what Supabase ships in the OAuth redirect. With the `/v2`-less routing that's:
```
https://<your-prod-domain>/api/integrations/github/callback
```

GitHub supports multiple callback URLs on a single app; add dev + prod.

**Homepage URL** is cosmetic — shows to end-users on the consent screen.

Scopes requested (set in code — `src/lib/integrations/providers/github.ts`):
```
repo           — read + write org + user repo access
read:org       — list orgs (for repo discovery)
read:user      — basic profile
user:email     — verified email for attribution
```

---

## Environment variables

Set in Vercel → Project → Settings → Environment Variables. Tick **Production** and **Preview** for each (unless noted).

| Variable | Scope | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Production + Preview | Client-side Supabase URL (must have `NEXT_PUBLIC_` prefix) |
| `SUPABASE_URL` | Production + Preview | Server-side alias (some routes read this) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production + Preview | Client + server, RLS-scoped |
| `SUPABASE_ANON_KEY` | Production + Preview | Server-side alias |
| `SUPABASE_SERVICE_ROLE_KEY` | Production + Preview | **Server-only.** Never add `NEXT_PUBLIC_`. RLS-bypass. |
| `EVALUATEAI_ENCRYPTION_KEY` | Production + Preview | **Critical — same value everywhere.** AES-256-GCM key for integration tokens. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. |
| `GITHUB_OAUTH_CLIENT_ID` | Production + Preview | Per-user GitHub integration OAuth client |
| `GITHUB_OAUTH_CLIENT_SECRET` | Production + Preview | Same |
| `ANTHROPIC_API_KEY` | Production (+ optional Preview) | LLM-powered prompt scoring and meeting-task extraction. Optional — features degrade gracefully without it. |

### Why `EVALUATEAI_ENCRYPTION_KEY` must be identical across environments

Integration tokens are encrypted with this key and stored as ciphertext in Postgres. If a token is encrypted with key A in preview and key B in production, decryption fails on the wrong side.

In practice:
1. Generate one key during dev
2. Copy to your Vercel Production environment
3. Copy the exact same value to your Vercel Preview environment
4. Local `.env` file uses the same value too

Rotating this key is a planned operation: re-encrypt all existing rows in a one-shot job before swapping. Never generate a new key as "an upgrade" — you'll lock users out until they reconnect.

### Env var hygiene

- Don't prefix service-role keys or encryption keys with `NEXT_PUBLIC_` — that exposes them in the browser bundle
- Vercel does not allow secrets to be empty strings; use Vercel's "Encrypted" marker for sensitive values

---

## Database migrations

Applied in order from `packages/dashboard/supabase/migrations/`. Against the Supabase project:

```bash
# If using Supabase CLI (recommended for prod):
supabase link --project-ref <your-ref>
supabase db push

# Or via Supabase Dashboard SQL Editor — paste and run each migration file in order
```

The migrations are idempotent (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ADD COLUMN IF NOT EXISTS`), so re-running is safe.

Migration `014_backfill_user_integrations.sql` is a **cutover** migration — it seeds `team_tracked_repos` from legacy `integrations.config.tracked_repos` for any teams not already migrated. Run it once during cutover to pre-seed; the app will otherwise do a lazy migration on first v2 sync.

---

## Vercel-specific considerations

### Function duration

Default 60s on Pro; 10s on Hobby. The sync routes run background work via Next.js `after()` inside the same function invocation, so the function must live long enough for the background work to finish.

If `sync_jobs` rows start getting stuck in `running` status, add:

```ts
// packages/dashboard/src/app/api/integrations/github/sync/route.ts
// packages/dashboard/src/app/api/integrations/fireflies/sync/route.ts
export const maxDuration = 300; // Pro extended
```

Not required up front. Add only when durations approach the ceiling (check via `SELECT EXTRACT(EPOCH FROM (finished_at - started_at)) FROM sync_jobs`).

### Supabase region

Vercel functions should be deployed in the same region as Supabase to minimize latency. Set in Vercel project settings → Functions → Region.

### Static pages vs dynamic routes

The dashboard uses client components for most authenticated views, which means Vercel's edge caching isn't in play for most authenticated traffic. Acceptable — the data is personalized. The landing page (`/`) is static and cached.

---

## Post-deploy smoke test

```
1. Visit /auth/signup → sign up with email + password → land on /onboarding
2. Create a team → land on /dashboard
3. /dashboard/integrations → Connect GitHub → complete OAuth → return with user_integrations row
4. Click Sync → 202 + jobId → watch progress → done with stats
5. /profile → Connected Accounts section → Connect Google → land back on /profile
   with both providers showing
6. Log out, log back in with Google (same email) → should land on /dashboard as
   the same user (no duplicate account)
7. /auth/login → enter wrong password → see hint about Google sign-in
```

If step 7 works and steps 1-6 have no console errors, the deploy is healthy.

---

## Rollback

Vercel keeps every deployment. To roll back instantly:

1. Vercel dashboard → Deployments → find the last good one → "Promote to Production"

For environment issues specifically:
- Rolling back env vars does not redeploy; you must trigger a redeploy (empty commit + push, or "Redeploy" in Vercel)

For database issues (bad migration, etc.):
- Supabase has point-in-time recovery on paid plans
- Before running large migrations, take a snapshot via Supabase dashboard → Database → Backups

For a full integrations rollback (v2 → legacy), see [`integrations.md`](./integrations.md) § Feature flag (kill switch).
