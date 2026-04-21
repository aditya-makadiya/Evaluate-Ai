# EvaluateAI Docs

Current reference docs for the platform. Architecture, per-feature deep dives, and the deployment runbook live here. Anything labeled "plan" has been implemented — the docs in this folder describe **what is**, not what was proposed.

## Navigation

| Document | Scope |
|---|---|
| [`architecture.md`](./architecture.md) | Monorepo layout, data plane, trust model, how pieces fit together |
| [`integrations.md`](./integrations.md) | Per-user GitHub/Fireflies integration flow — how sync works, how to enable per team, cutover state |
| [`deployment.md`](./deployment.md) | Vercel + Supabase + Google OAuth setup. Environment variables, redirect URLs, production checklist |

## History

Earlier planning documents live in [`history/`](./history/). They're kept for context on how the codebase evolved but are **not current truth**. If a fact contradicts what's in this folder, trust this folder.

| Archive | What it captured |
|---|---|
| [`history/integrations-ownership-plan.md`](./history/integrations-ownership-plan.md) | The 6-phase design proposal for the per-user integrations rework. Superseded by `integrations.md`. |
| [`history/production-plan.md`](./history/production-plan.md) | Original SaaS-readiness plan (auth, RBAC, RLS, CLI distribution). Most items shipped; see current code + `deployment.md`. |
| [`history/comprehensive-plan.md`](./history/comprehensive-plan.md) | Early product vision for the meetings → tasks → code → AI pipeline. Now mostly reality. |
| [`history/phase5-plan.md`](./history/phase5-plan.md) | Feature roadmap for post-MVP (Fireflies, task extraction, Jira, Slack). Fireflies + task extraction shipped; Jira/Slack/Sprint view deferred. |
| [`history/progress.md`](./history/progress.md) | Development progress tracker through Phase 4 (MVP complete, April 2026). |

## Where else to look

| Topic | Location |
|---|---|
| Per-package dev rules | `packages/{cli,core,dashboard}/CLAUDE.md` |
| Quick-start + install | Root [`README.md`](../README.md) and [`packages/cli/README.md`](../packages/cli/README.md) |
| Database schema | `packages/dashboard/supabase/migrations/*.sql` (source of truth) |
| API route behavior | Read the routes directly — they're short; comments explain non-obvious choices |

## Contributing

When the behavior of something in the product changes in a load-bearing way, update the matching doc here in the same commit. Archives are not updated — they are frozen snapshots.
