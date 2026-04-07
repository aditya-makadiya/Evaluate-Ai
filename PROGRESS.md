# EvaluateAI — Development Progress Tracker

## Current Status: Phase 1-3 Complete. Ready for Phase 4 (Launch)

---

## Phase 1: Foundation + npm Package Update (Weeks 1-3)

### Week 1: Supabase Migration + Core Rewrite

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1.1 | Create new Supabase schema (14 tables, 22 indexes, 1 view) | ✅ DONE | SQL ready, needs to be run in Supabase |
| 1.2 | Rewrite core/db — remove SQLite, use Supabase client only | ✅ DONE | Removed better-sqlite3, drizzle-orm |
| 1.3 | Rewrite CLI hooks to write directly to Supabase | ✅ DONE | All 6 hooks + all commands |
| 1.4 | Rewrite dashboard API routes for Supabase | ✅ DONE | All 5 API routes use Supabase |
| 1.5 | Add `evalai init --team <id>` command | ⬜ TODO | |
| 1.6 | Transcript parser (unchanged — reads local files) | ✅ DONE | Stays local, pushes data to Supabase |
| 1.7 | Test: hook → Supabase → verify data | ✅ DONE | All 14 tables created, hook→Supabase flow verified |

### Week 2: GitHub Integration + Team Setup

| # | Task | Status | Notes |
|---|------|--------|-------|
| 2.1 | Team creation + invite flow (web app auth) | ⬜ TODO | |
| 2.2 | GitHub OAuth integration | ⬜ TODO | |
| 2.3 | GitHub webhook receiver (commits, PRs, reviews) | ⬜ TODO | |
| 2.4 | Code change ingestion pipeline | ⬜ TODO | |
| 2.5 | AI commit summarizer (Claude Haiku) | ⬜ TODO | |
| 2.6 | Map GitHub username → team member | ⬜ TODO | |

### Week 3: Manager Dashboard v1

| # | Task | Status | Notes |
|---|------|--------|-------|
| 3.1 | Rewrite dashboard to read from Supabase (remove SQLite/better-sqlite3) | ⬜ TODO | |
| 3.2 | Team overview page (health score, stats) | ⬜ TODO | |
| 3.3 | Developer grid page (cards with scores) | ⬜ TODO | |
| 3.4 | Developer deep-dive with Activity Timeline | ⬜ TODO | |
| 3.5 | Daily cron job (aggregate daily stats + AI usage) | ⬜ TODO | |
| 3.6 | Slack daily digest delivery | ⬜ TODO | |

---

## Phase 2: Meeting Intelligence (Weeks 4-6)

### Week 4: Fireflies Integration

| # | Task | Status | Notes |
|---|------|--------|-------|
| 4.1 | Fireflies OAuth + webhook integration | ⬜ TODO | |
| 4.2 | Meeting ingestion pipeline | ⬜ TODO | |
| 4.3 | AI task extraction from transcripts | ⬜ TODO | |
| 4.4 | Meeting detail page | ⬜ TODO | |

### Week 5: Task-Code Matching

| # | Task | Status | Notes |
|---|------|--------|-------|
| 5.1 | Semantic similarity matching (task ↔ commit) | ⬜ TODO | |
| 5.2 | Meeting → Code tracker page | ⬜ TODO | |
| 5.3 | Task status tracking (pending → done) | ⬜ TODO | |
| 5.4 | Alignment scoring engine | ⬜ TODO | |

### Week 6: Alerts + Sprint View

| # | Task | Status | Notes |
|---|------|--------|-------|
| 6.1 | Alerts system (stale tasks, sprint risk, high AI cost) | ⬜ TODO | |
| 6.2 | Notification delivery (Slack DM + email) | ⬜ TODO | |
| 6.3 | Sprint view page | ⬜ TODO | |
| 6.4 | Polish + error handling | ⬜ TODO | |

---

## Phase 3: Advanced Intelligence (Weeks 7-9)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 7.1 | Jira/Linear integration | ⬜ TODO | |
| 7.2 | Weekly report generation | ⬜ TODO | |
| 7.3 | Developer optional dashboard (/my pages) | ⬜ TODO | |
| 7.4 | Export functionality (CSV, PDF) | ⬜ TODO | |

---

## Phase 4: Launch (Weeks 10-12)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 10.1 | Landing page | ⬜ TODO | |
| 10.2 | Billing (Stripe) | ⬜ TODO | |
| 10.3 | Beta testing (5 teams) | ⬜ TODO | |
| 10.4 | Product Hunt launch | ⬜ TODO | |

---

## Completed Items (Previous Phases)

| Item | Date | Notes |
|------|------|-------|
| npm package published (evaluateai@1.1.0) | 2026-04-06 | CLI + core on npm |
| Intent-aware scoring engine | 2026-04-06 | 7 intent types, 152 tests |
| Transcript parser (exact tokens) | 2026-04-06 | Reads Claude Code JSONL |
| Dashboard v1 (dark/light theme) | 2026-04-06 | 6 pages, premium UI |
| Turn detail page (flagship) | 2026-04-06 | Score ring, AI coaching |
| Supabase integration | 2026-04-05 | Schema + sync |
| Claude Code hooks (6 events) | 2026-04-05 | Auto-capture prompts |
| Heuristic scorer (10 patterns) | 2026-04-05 | 4 positive signals |
| 152 unit + E2E tests | 2026-04-05 | All passing |

---

## Blockers

| Blocker | Impact | Resolution |
|---------|--------|------------|
| None currently | | |

---

*Last updated: 2026-04-07*
