# EvaluateAI — Developer Productivity Intelligence Platform
# Comprehensive Plan v2

---

## Executive Summary

A platform where **engineering managers get full visibility** into team productivity by connecting:

```
Meeting decisions → Assigned tasks → Code output → AI usage → Delivery verification
```

### 4 Data Sources

| Source | How | Developer Action |
|--------|-----|-----------------|
| **GitHub** | Webhooks (commits, PRs, reviews) | None — automatic |
| **Meetings** | Fireflies/Otter webhooks | None — bot records automatically |
| **Jira/Linear** | API sync | None — already using it |
| **AI Prompts & Responses** | `evaluateai` npm package (Claude Code hooks) | `npm install -g evaluateai && evalai init` — one-time setup |

The npm package we already built (`evaluateai`) captures every AI prompt, response, token usage, and cost. This data syncs to Supabase where the manager dashboard can show:
- Which developer uses AI and how much
- Prompt quality scores per developer
- AI cost per developer per sprint
- Whether AI-assisted code aligns with assigned tasks

---

## Part 1: How the npm Package Fits In

### What We Already Built (evaluateai npm package)

```
Developer installs: npm install -g evaluateai
Developer runs:     evalai init (installs Claude Code hooks)
That's it — everything else is automatic:

Claude Code hooks capture:
├── Every prompt text (UserPromptSubmit hook)
├── Every AI response (from transcript JSONL)
├── Exact token counts (input, output, cache read/write)
├── Exact cost per turn
├── Tool calls (Edit, Bash, Read, etc.)
├── Prompt quality score (heuristic, intent-aware)
├── Session duration and turn count
└── Files changed by AI

Data stored in:
└── Supabase (direct write on every event — no local SQLite)
```

### What the Manager Sees from npm Package Data

```
MANAGER DASHBOARD — AI USAGE SECTION

Developer: Adi (Senior Dev)
├── AI Sessions this week: 23
├── Total AI cost: $12.40
├── Avg prompt score: 74/100
├── AI-assisted commits: 40% (14/35 commits)
├── Most used model: Claude Sonnet (68%), Opus (32%)
├── Token usage: 189K tokens
├── Top issue: "vague_verb" (3x this week)
└── Prompt improvement trend: ↑12pts over last month

Developer: Jake (Junior Dev)
├── AI Sessions this week: 42
├── Total AI cost: $31.20 ⚠️ (highest on team)
├── Avg prompt score: 48/100 ⚠️ (needs coaching)
├── AI-assisted commits: 75% (high dependency)
├── Most used model: Claude Opus (85%) ⚠️ (expensive)
├── Token usage: 412K tokens
├── Top issue: "retry_detected" (8x) — keeps retrying same prompts
└── Recommendation: "Jake should use Sonnet instead of Opus for simple tasks. Would save ~$18/week"
```

### How Data Flows

```
Developer's Terminal (Claude Code)
        │
        ▼
evaluateai npm package (hooks)
        │
        ├── Captures prompt + response + tokens + cost
        ├── Scores prompt quality (heuristic)
        ├── Shows suggestion if score < threshold
        │
        ▼
Supabase (direct write)
                                │
                                ▼
                    Manager Dashboard
                    ├── AI Usage per developer
                    ├── Cost breakdown
                    ├── Prompt quality trends
                    ├── AI vs manual work ratio
                    └── Cross-reference: AI sessions ↔ tasks ↔ commits
```

---

## Part 2: Manager Experience (Primary)

### 2.1 Complete Manager Dashboard

```
MANAGER DASHBOARD
│
├── /dashboard (Team Overview)
│   ├── Team health score: 78/100
│   ├── Active developers: 7/8
│   ├── PRs merged: 12
│   ├── Tasks completed: 9/15
│   ├── Total AI spend: $67.40 this week
│   └── Alerts: 3 items need attention
│
├── /meetings (Meeting → Code Tracker)
│   ├── Monday standup → 5 action items extracted
│   │   ├── ✅ "Fix auth bug" → PR #234 merged (Adi)
│   │   ├── ✅ "Add pagination" → PR #237 open (Priya)
│   │   ├── 🔄 "Refactor payment" → 3 commits, no PR yet (Jake)
│   │   ├── ⚠️ "Update docs" → No code activity (Sara) — 3 days
│   │   └── ❌ "Setup monitoring" → No activity (Rob) — 5 days
│   └── Meeting → delivery conversion rate: 73%
│
├── /developers (Team Grid)
│   ├── Card per developer showing:
│   │   ├── Name, role, avatar
│   │   ├── Alignment score (color-coded)
│   │   ├── This week: commits, PRs, reviews
│   │   ├── AI cost this week
│   │   └── Status indicator (on track / at risk / blocked)
│   │
│   └── Sort by: score, cost, activity, name
│
├── /developers/:id (Developer Deep Dive)
│   │
│   ├── ACTIVITY TIMELINE TAB (default view)
│   │   A real-time chronological feed of EVERYTHING the developer did:
│   │
│   │   ┌─────────────────────────────────────────────────────────────┐
│   │   │ ACTIVITY TIMELINE — Adi (Today)                  [Filter ▾]│
│   │   │                                                             │
│   │   │ 4:32 PM ── 🤖 AI Prompt (Score: 82)                       │
│   │   │            "Add error handling to the payment webhook       │
│   │   │             in src/payments/webhook.ts for timeout cases"   │
│   │   │            Model: Sonnet · Cost: $0.008 · 2 turns          │
│   │   │            [View full session →]                            │
│   │   │                                                             │
│   │   │ 4:28 PM ── 🤖 AI Response Completed                       │
│   │   │            Generated: try/catch block with retry logic      │
│   │   │            Tokens: 1,200 in · 3,400 out · $0.008           │
│   │   │            Files modified: src/payments/webhook.ts          │
│   │   │                                                             │
│   │   │ 4:15 PM ── 💻 Commit: "feat: add webhook error handling"  │
│   │   │            src/payments/webhook.ts (+45 -8)                 │
│   │   │            Branch: feature/payment-webhooks                 │
│   │   │            Matched task: "Handle payment webhook errors" ✅ │
│   │   │                                                             │
│   │   │ 3:50 PM ── 🔀 PR #241 Opened: "Payment webhook handling"  │
│   │   │            3 files changed · +89 -12                        │
│   │   │            Reviewers: Priya, Sara                           │
│   │   │            Status: Review requested                        │
│   │   │                                                             │
│   │   │ 3:20 PM ── 🤖 AI Prompt (Score: 35) ⚠️                    │
│   │   │            "fix the webhook"                                │
│   │   │            Tip shown: "Add file path and error message"     │
│   │   │            Model: Opus · Cost: $0.12 ⚠️ (expensive)        │
│   │   │                                                             │
│   │   │ 2:45 PM ── 👀 Review Given on PR #238 (Jake's PR)         │
│   │   │            "Looks good, but add null check on line 47"      │
│   │   │                                                             │
│   │   │ 2:00 PM ── ✅ Task Completed: "Fix auth middleware"        │
│   │   │            From: Monday standup meeting                     │
│   │   │            PR #234 merged · 2.3 hours to merge              │
│   │   │                                                             │
│   │   │ 1:30 PM ── 💻 Commit: "fix: null check in auth middleware"│
│   │   │            src/auth/middleware.ts (+12 -3)                   │
│   │   │            AI-assisted: Yes (session abc123)                │
│   │   │                                                             │
│   │   │ 1:15 PM ── 🤖 AI Session Started                          │
│   │   │            Project: /Users/adi/myapp                        │
│   │   │            Model: Claude Sonnet 4.6                         │
│   │   │                                                             │
│   │   │ 11:00 AM ── 🗓️ Meeting: "Monday Standup"                  │
│   │   │            Tasks assigned to Adi:                            │
│   │   │            1. "Fix auth middleware" → ✅ Done                │
│   │   │            2. "Handle payment webhook errors" → 🔄 In Progress
│   │   │                                                             │
│   │   │ 10:30 AM ── 🔀 PR #234 Merged: "Auth middleware fix"      │
│   │   │            Merged by: Priya · Review time: 2.3h             │
│   │   │                                                             │
│   │   │ 9:15 AM ── 💻 Commit: "test: add JWT expiry test"         │
│   │   │            tests/auth.test.ts (+34 -0)                      │
│   │   │            AI-assisted: Yes                                  │
│   │   └─────────────────────────────────────────────────────────────┘
│   │
│   │   Timeline event types:
│   │   🤖 AI Prompt      — prompt text, score, cost, model (from npm package)
│   │   🤖 AI Response    — response summary, tokens, files modified
│   │   💻 Commit         — message, files, lines, branch, matched task
│   │   🔀 PR Opened      — title, files, reviewers
│   │   🔀 PR Merged      — merged by, review time
│   │   👀 Review Given   — on which PR, comment summary
│   │   ✅ Task Completed — which task, from which meeting
│   │   🗓️ Meeting        — tasks assigned, participants
│   │   ⚠️ Alert          — stale task, high cost, low score
│   │
│   │   Filters:
│   │   [All] [AI Only] [Code Only] [Meetings] [Tasks]
│   │   Date range: [Today] [This Week] [Custom]
│   │
│   ├── WORK TAB
│   │   ├── Commits list (grouped by day)
│   │   ├── PRs opened/merged
│   │   ├── Reviews given
│   │   ├── Tasks: assigned vs completed
│   │   └── Alignment score trend (30 days)
│   │
│   ├── AI USAGE TAB ← npm package data
│   │   ├── Sessions list (from evaluateai Supabase sync)
│   │   ├── Total AI cost (exact, from transcript parsing)
│   │   ├── Prompt quality avg score
│   │   ├── Top anti-patterns ("vague_verb 3x, retry 2x")
│   │   ├── Model usage breakdown (Opus vs Sonnet vs Haiku)
│   │   ├── Token consumption trend
│   │   ├── AI-assisted vs manual commits ratio
│   │   └── Click session → see turn-by-turn detail
│   │       ├── Each prompt with score
│   │       ├── AI response text
│   │       ├── Token breakdown
│   │       └── Cost per turn
│   │
│   └── INSIGHTS TAB
│       ├── "Jake uses Opus for 85% of queries — switching to Sonnet would save $18/week"
│       ├── "Jake retries prompts 8x/week — prompt coaching would improve efficiency"
│       ├── "Adi's prompt scores improved 70→85 over 30 days"
│       └── "Sara hasn't used AI tools this week — may not have evaluateai installed"
│
├── /tasks (All Tasks)
│   ├── Filter: status, assignee, source (meeting/jira), date
│   ├── Each task shows: description, assignee, status, matched commits
│   └── Overdue items highlighted
│
├── /reports (Auto-Generated Reports)
│   ├── Daily digest (9 AM, Slack/email)
│   │   ├── Yesterday's work per developer
│   │   ├── Tasks completed vs planned
│   │   ├── AI spend yesterday: $X.XX
│   │   └── Items needing attention
│   │
│   ├── Weekly report (Monday 9 AM)
│   │   ├── Sprint progress %
│   │   ├── Per-developer alignment scores
│   │   ├── AI cost breakdown by developer
│   │   ├── Meeting → delivery conversion rate
│   │   └── Top 3 recommendations
│   │
│   └── Sprint retrospective data
│       ├── Planned vs shipped
│       ├── Estimation accuracy
│       ├── AI usage impact on velocity
│       └── Cost analysis
│
├── /alerts (Notification Center)
│   ├── 🔴 "Task 'Setup monitoring' — no activity 5 days (Rob)"
│   ├── 🟡 "Jake's AI cost is $31/week — 2x team average"
│   ├── 🟡 "Sprint at 60% with 1 day remaining"
│   ├── 🟢 "Adi's prompt scores hit 85 — personal best"
│   └── Configure: thresholds, delivery channel, frequency
│
├── /integrations (Connect Services)
│   ├── GitHub: [Connected ✓] — 5 repos tracked
│   ├── Fireflies: [Connected ✓] — auto-recording meetings
│   ├── Jira: [Connected ✓] — 2 projects synced
│   ├── Slack: [Connected ✓] — alerts to #engineering
│   └── EvaluateAI CLI: [6/8 devs installed] ← npm package status
│       ├── Adi ✓ installed, syncing
│       ├── Priya ✓ installed, syncing
│       ├── Jake ✓ installed, syncing
│       ├── Sara ✗ not installed ← "Send install invite"
│       └── Rob ✗ not installed ← "Send install invite"
│
└── /settings
    ├── Team members (invite, roles)
    ├── Alert thresholds
    ├── Report schedule
    ├── AI cost budget (per developer, per team)
    └── Privacy controls
```

### 2.2 Manager Workflows

**Daily (2 minutes):**
```
9 AM → Slack digest arrives automatically
     → Glance: team score, any red alerts
     → See: "Rob has stale task, Jake's AI cost is high"
     → One click: send Rob a nudge, review Jake's AI sessions
     → Done
```

**Weekly (10 minutes):**
```
Monday → Weekly report in Slack
       → Sprint: 80% complete, 2 dropped tasks
       → AI cost: $142 this week, Jake = $31 (highest)
       → Click Jake → AI Usage tab → see he uses Opus for simple questions
       → Action: share model recommendation with Jake
```

**Performance Review (15 minutes):**
```
Open /developers/adi → 3-month view
  → 142 commits, 34 PRs, 28 reviews
  → Alignment score: 70% → 85% (improving)
  → AI cost: $45/month (reasonable)
  → Prompt quality: 72 → 85 (learning fast)
  → Zero dropped tasks
  → Data-driven review conversation
```

---

## Part 3: Developer Experience

### 3.1 npm Package Setup (One-Time)

Manager sends install link to team:

```bash
npm install -g evaluateai
evalai init
# Done — hooks installed, everything automatic from here
```

### 3.2 What Happens Automatically After Install

Developer uses Claude Code normally. Zero behavior change:

```
Developer types prompt in Claude Code
        │
        ▼
Hook fires automatically:
  → Prompt scored (heuristic, 0ms)
  → Prompt + response saved directly to Supabase
  → If score < threshold: quick tip shown
        │
        ▼
Manager sees data in dashboard
(developer doesn't need to do anything else)
```

### 3.3 What Developer Optionally Sees

If developer visits their dashboard (not required):

```
/my/overview
  → My work: 14 commits, 3 PRs this week
  → My AI cost: $8.40
  → My prompt score avg: 74/100
  → My tasks: 3/4 completed

/my/ai-sessions
  → List of all AI sessions
  → Click → see turn-by-turn detail
  → Prompt scores with improvement tips
  → Token breakdown

/my/trends
  → Productivity trend (30 days)
  → Prompt quality improvement
  → Cost trend
  → AI dependency ratio
```

### 3.4 Developer Doesn't Need npm Package for Core Features

Even without the npm package, the manager still gets:
- ✅ GitHub commits, PRs, reviews (from webhooks)
- ✅ Meeting → task extraction (from Fireflies)
- ✅ Task → code alignment (from matching engine)
- ✅ Alignment scores
- ✅ Daily/weekly reports

The npm package ADDS:
- 🆕 AI prompt/response tracking
- 🆕 AI cost per developer
- 🆕 Prompt quality scores
- 🆕 AI usage patterns
- 🆕 Model recommendation insights

---

## Part 4: Data Architecture

### 4.1 What Lives Where

```
ALL DATA IN SUPABASE (Cloud — Single Source of Truth):
  ├── teams, team_members          ← Team structure
  ├── integrations                 ← GitHub, Fireflies, Jira, Slack tokens
  ├── meetings                     ← Meeting transcripts
  ├── tasks                        ← Action items (from meetings + Jira)
  ├── code_changes                 ← Commits, PRs, reviews (from GitHub)
  ├── daily_reports                ← Auto-generated per developer per day
  ├── alignment_reports            ← Team-level daily cron output
  ├── alerts                       ← Notifications
  │
  │── (FROM NPM PACKAGE — auto-synced):
  ├── ai_sessions                  ← Developer AI sessions (includes tool_usage_summary JSONB)
  ├── ai_turns                     ← Individual prompts + responses
  ├── ai_tool_events              ← AI tool usage (deprecated — tool data now in ai_sessions.tool_usage_summary)
  └── ai_scoring_calls            ← Scoring API costs
```

### 4.2 Database Schema

```sql
-- ================================================================
-- TEAM & MEMBERS
-- ================================================================

CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  owner_id UUID REFERENCES auth.users(id),
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT DEFAULT 'developer',
  github_username TEXT,
  evaluateai_installed BOOLEAN DEFAULT FALSE,
  last_ai_sync_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, email)
);

-- ================================================================
-- INTEGRATIONS
-- ================================================================

CREATE TABLE integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  webhook_secret TEXT,
  config JSONB DEFAULT '{}',
  status TEXT DEFAULT 'active',
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- MEETINGS & TASKS
-- ================================================================

CREATE TABLE meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  external_id TEXT,
  title TEXT NOT NULL,
  date TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER,
  participants JSONB,
  transcript TEXT,
  summary TEXT,
  source TEXT NOT NULL,
  action_items_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  meeting_id UUID REFERENCES meetings(id),
  assignee_id UUID REFERENCES team_members(id),
  title TEXT NOT NULL,
  description TEXT,
  source TEXT NOT NULL,
  external_id TEXT,
  priority TEXT DEFAULT 'medium',
  deadline TIMESTAMPTZ,
  status TEXT DEFAULT 'pending',
  status_updated_at TIMESTAMPTZ,
  matched_changes TEXT[],
  alignment_score REAL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- CODE CHANGES (GitHub)
-- ================================================================

CREATE TABLE code_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  developer_id UUID REFERENCES team_members(id),
  type TEXT NOT NULL,
  external_id TEXT NOT NULL,
  repo TEXT NOT NULL,
  branch TEXT,
  title TEXT,
  body TEXT,
  files_changed INTEGER DEFAULT 0,
  additions INTEGER DEFAULT 0,
  deletions INTEGER DEFAULT 0,
  ai_summary TEXT,
  matched_task_ids UUID[],
  is_planned BOOLEAN,
  is_ai_assisted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL
);

-- ================================================================
-- AI SESSIONS & TURNS (from npm package sync)
-- ================================================================

CREATE TABLE ai_sessions (
  id TEXT PRIMARY KEY,
  team_id UUID REFERENCES teams(id),
  developer_id UUID REFERENCES team_members(id),
  tool TEXT NOT NULL DEFAULT 'claude-code',
  model TEXT,
  project_dir TEXT,
  git_repo TEXT,
  git_branch TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  total_turns INTEGER DEFAULT 0,
  total_input_tokens INTEGER DEFAULT 0,
  total_output_tokens INTEGER DEFAULT 0,
  total_cost_usd DOUBLE PRECISION DEFAULT 0,
  total_tool_calls INTEGER DEFAULT 0,
  files_changed INTEGER DEFAULT 0,
  avg_prompt_score DOUBLE PRECISION,
  efficiency_score DOUBLE PRECISION,
  token_waste_ratio DOUBLE PRECISION,
  analysis JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ai_turns (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES ai_sessions(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id),
  developer_id UUID REFERENCES team_members(id),
  turn_number INTEGER NOT NULL,
  prompt_text TEXT,
  prompt_hash TEXT NOT NULL,
  prompt_tokens_est INTEGER,
  heuristic_score DOUBLE PRECISION,
  anti_patterns JSONB,
  llm_score DOUBLE PRECISION,
  score_breakdown JSONB,
  suggestion_text TEXT,
  response_tokens_est INTEGER,
  tool_calls JSONB,
  latency_ms INTEGER,
  was_retry BOOLEAN DEFAULT FALSE,
  intent TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

-- ================================================================
-- REPORTS & ALERTS
-- ================================================================

CREATE TABLE daily_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  developer_id UUID REFERENCES team_members(id),
  date DATE NOT NULL,
  commits_count INTEGER DEFAULT 0,
  prs_opened INTEGER DEFAULT 0,
  prs_merged INTEGER DEFAULT 0,
  reviews_given INTEGER DEFAULT 0,
  lines_added INTEGER DEFAULT 0,
  lines_removed INTEGER DEFAULT 0,
  ai_summary TEXT,
  tasks_assigned INTEGER DEFAULT 0,
  tasks_completed INTEGER DEFAULT 0,
  planned_commits INTEGER DEFAULT 0,
  unplanned_commits INTEGER DEFAULT 0,
  alignment_score REAL,
  -- AI usage stats (from npm package)
  ai_sessions_count INTEGER DEFAULT 0,
  ai_total_cost DOUBLE PRECISION DEFAULT 0,
  ai_avg_prompt_score DOUBLE PRECISION,
  ai_tokens_used INTEGER DEFAULT 0,
  ai_model_breakdown JSONB,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(developer_id, date)
);

CREATE TABLE alignment_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  team_health_score REAL,
  active_developers INTEGER,
  total_developers INTEGER,
  tasks_total INTEGER,
  tasks_completed INTEGER,
  tasks_in_progress INTEGER,
  tasks_dropped INTEGER,
  unplanned_work_count INTEGER,
  total_commits INTEGER,
  total_prs INTEGER,
  total_ai_cost DOUBLE PRECISION DEFAULT 0,
  avg_prompt_score DOUBLE PRECISION,
  meeting_to_code_rate REAL,
  analysis JSONB,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, date)
);

CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  developer_id UUID REFERENCES team_members(id),
  task_id UUID REFERENCES tasks(id),
  is_read BOOLEAN DEFAULT FALSE,
  is_dismissed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- ACTIVITY TIMELINE (unified chronological feed)
-- Populated by triggers/cron from all other tables
-- ================================================================

CREATE TABLE activity_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  developer_id UUID REFERENCES team_members(id),
  event_type TEXT NOT NULL,
  -- Event types:
  --   'ai_prompt'         — developer sent AI prompt (from npm package)
  --   'ai_response'       — AI responded (from npm package)
  --   'ai_session_start'  — AI session started
  --   'ai_session_end'    — AI session ended with summary
  --   'commit'            — git commit (from GitHub)
  --   'pr_opened'         — PR opened
  --   'pr_merged'         — PR merged
  --   'pr_closed'         — PR closed without merge
  --   'review_given'      — code review submitted
  --   'task_assigned'     — task assigned from meeting/Jira
  --   'task_completed'    — task marked done
  --   'task_dropped'      — task not started after deadline
  --   'meeting'           — meeting occurred, tasks extracted
  --   'alert'             — system alert generated
  title TEXT NOT NULL,              -- short display text
  description TEXT,                 -- detail text (prompt text, commit msg, etc.)
  metadata JSONB DEFAULT '{}',     -- type-specific data:
  -- ai_prompt:    { session_id, score, model, cost, intent, anti_patterns }
  -- ai_response:  { session_id, tokens_in, tokens_out, cost, files_modified }
  -- commit:       { sha, repo, branch, files_changed, additions, deletions, matched_task_id }
  -- pr_opened:    { pr_number, repo, title, reviewers, files_changed }
  -- pr_merged:    { pr_number, repo, merged_by, review_time_hours }
  -- review_given: { pr_number, repo, state, body_preview }
  -- task_assigned:{ task_id, meeting_id, deadline, priority }
  -- task_completed:{ task_id, meeting_title, pr_number, time_to_complete }
  -- meeting:      { meeting_id, title, tasks_assigned_count, participants }
  -- alert:        { alert_id, severity, type }
  source_id TEXT,                   -- ID of the source record (commit SHA, session ID, etc.)
  source_table TEXT,                -- which table it came from
  is_ai_assisted BOOLEAN DEFAULT FALSE,  -- was AI involved in this activity?
  occurred_at TIMESTAMPTZ NOT NULL, -- when it actually happened
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- INDEXES
-- ================================================================

CREATE INDEX idx_tasks_team ON tasks(team_id, status);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX idx_code_changes_dev ON code_changes(developer_id, created_at);
CREATE INDEX idx_ai_sessions_dev ON ai_sessions(developer_id, started_at);
CREATE INDEX idx_ai_turns_session ON ai_turns(session_id);
CREATE INDEX idx_ai_turns_dev ON ai_turns(developer_id, created_at);
CREATE INDEX idx_daily_reports_dev ON daily_reports(developer_id, date);
CREATE INDEX idx_timeline_dev ON activity_timeline(developer_id, occurred_at DESC);
CREATE INDEX idx_timeline_team ON activity_timeline(team_id, occurred_at DESC);
CREATE INDEX idx_timeline_type ON activity_timeline(team_id, event_type, occurred_at DESC);
CREATE INDEX idx_alerts_team ON alerts(team_id, is_read);
CREATE INDEX idx_meetings_team ON meetings(team_id, date);
```

### 4.3 npm Package Sync Changes Needed

Current sync pushes to `sessions` and `turns` tables. Need to update to push to `ai_sessions` and `ai_turns` with team_id and developer_id:

```
CURRENT:  evaluateai sync → pushes to sessions, turns
UPDATED:  evaluateai sync → pushes to ai_sessions, ai_turns
          + includes team_id (from config)
          + includes developer_id (matched by email/github username)
```

The npm package needs a small update:
1. `evalai init --team <team-id>` — associate with a team
2. Sync endpoint sends team_id + developer email with each record
3. Supabase matches email → team_member → developer_id

---

## Part 5: How npm Package Data Enriches Manager View

### 5.1 AI Cost Tracking (Exact)

The npm package captures exact tokens from Claude Code transcripts:

```
Manager sees in /developers/jake:

AI COST BREAKDOWN — Jake (This Week)
┌────────────────────────────────────────────────┐
│ Model         │ Sessions │ Tokens  │ Cost      │
├───────────────┼──────────┼─────────┼───────────┤
│ Claude Opus   │    18    │ 312K    │ $24.80    │
│ Claude Sonnet │     6    │  89K    │  $5.40    │
│ Claude Haiku  │     2    │  11K    │  $0.04    │
├───────────────┼──────────┼─────────┼───────────┤
│ TOTAL         │    26    │ 412K    │ $31.20    │
└────────────────────────────────────────────────┘

⚠️ Jake uses Opus for 85% of sessions.
   Switching simple queries to Sonnet would save ~$18/week.
```

### 5.2 Prompt Quality per Developer

```
PROMPT QUALITY — Team View
┌─────────────┬──────────┬───────────────┬──────────────────────┐
│ Developer   │ Avg Score│ Trend (30d)   │ Top Issue            │
├─────────────┼──────────┼───────────────┼──────────────────────┤
│ Adi         │ 82/100   │ ↑ improving   │ —                    │
│ Priya       │ 76/100   │ → stable      │ no_expected_output   │
│ Jake        │ 48/100   │ ↓ declining   │ retry_detected (8x)  │
│ Sara        │ —        │ not installed │ —                    │
│ Rob         │ 71/100   │ ↑ improving   │ filler_words         │
└─────────────┴──────────┴───────────────┴──────────────────────┘
```

### 5.3 AI-Assisted vs Manual Work

```
CODE ORIGIN — Adi (This Sprint)
├── 35 total commits
├── 14 AI-assisted (40%) — happened during evaluateai sessions
├── 21 manual (60%) — no AI session active
│
├── AI-assisted commits breakdown:
│   ├── 8 bug fixes (AI helped debug)
│   ├── 4 feature implementations
│   └── 2 test generation
│
└── AI sessions → commit correlation:
    Session abc123 → 3 commits → PR #234 (auth fix)
    Session def456 → 2 commits → PR #237 (pagination)
```

### 5.4 Cross-Reference: Task → AI Session → Code

```
TASK: "Fix auth bug" (from Monday standup)
├── Assigned to: Adi
├── Status: ✅ Completed
│
├── AI Sessions used:
│   └── Session abc123 (45 min, $0.42)
│       ├── Turn 1: "fix the auth bug" → Score: 30 (vague)
│       ├── Turn 2: "Fix null ref in src/auth:47..." → Score: 82
│       ├── Turn 3: "Add test for JWT expiry..." → Score: 88
│       └── Total: 3 turns, 4,200 tokens
│
├── Code produced:
│   ├── Commit a1b2c3: "fix: null check in auth middleware"
│   ├── Commit d4e5f6: "test: add JWT expiry test"
│   └── PR #234: merged in 2.3 hours
│
└── Manager insight: "Task completed efficiently.
    AI helped debug and write tests. Good prompting after Turn 1."
```

---

## Part 6: Implementation Timeline

### Phase 1: Foundation + npm Package Update (Weeks 1-3)

```
Week 1:
├── Create new Supabase schema (ai_sessions, ai_turns tables)
├── Update npm package sync to push to new tables with team_id
├── Add `evalai init --team <id>` command
├── Team creation + invite flow (web app)
├── GitHub OAuth integration
└── MILESTONE: npm data flowing to team's Supabase

Week 2:
├── GitHub webhook receiver (commits, PRs)
├── Code change ingestion pipeline
├── Manager dashboard: team overview page
├── Developer grid with AI cost + score cards
└── MILESTONE: Manager sees GitHub + AI data

Week 3:
├── Developer deep-dive page (work + AI usage tabs)
├── Daily cron job (aggregate daily stats including AI usage)
├── Slack daily digest
├── Basic alignment scoring
└── MILESTONE: Daily reports with AI data
```

### Phase 2: Meeting Intelligence (Weeks 4-6)

```
Week 4: Fireflies integration + task extraction
Week 5: Task → code matching + alignment scores
Week 6: Meeting tracker page + alerts system
MILESTONE: Full meeting → code → AI verification
```

### Phase 3: Reports + Polish (Weeks 7-9)

```
Week 7: Weekly reports + sprint retrospective data
Week 8: Developer optional dashboard (/my pages)
Week 9: Jira/Linear integration + bidirectional sync
MILESTONE: Complete platform
```

### Phase 4: Launch (Weeks 10-12)

```
Week 10: Landing page + onboarding flow
Week 11: Billing (Stripe) + free tier limits
Week 12: Beta → Product Hunt → public launch
MILESTONE: Live product with paying customers
```

---

## Part 7: Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | Next.js 15 + Tailwind + Recharts | Reuse EvaluateAI dashboard |
| Backend API | Hono on Railway/Vercel | TypeScript, fast |
| Database | Supabase PostgreSQL | Already set up, RLS, realtime |
| Cron Jobs | Supabase Edge Functions | Daily analysis |
| AI Analysis | Claude Haiku | Task extraction, summaries |
| Auth | Supabase Auth + GitHub OAuth | Built-in |
| npm Package | evaluateai (published) | AI prompt/response tracking |
| Notifications | Slack API + Resend | Alerts + digests |

---

## Part 8: Pricing

| Tier | Price | Limit | Features |
|------|-------|-------|----------|
| **Free** | $0 | 3 devs, 1 repo | GitHub + AI tracking only |
| **Team** | $15/user/mo | 25 devs, 10 repos | + Meetings, alignment, reports |
| **Business** | $29/user/mo | 100 devs, unlimited | + Jira, API, custom reports |
| **Enterprise** | Custom | Unlimited | SSO, audit, on-prem, SLA |

---

## Part 9: What Makes This Unique

No competitor has all 4 data sources connected:

```
US:          Meeting notes → Tasks → GitHub code → AI prompts/responses
LinearB:     ✗               ✗       ✓              ✗
Jellyfish:   ✗               ✓       ✓              ✗
Swarmia:     ✗               ✗       ✓              ✗
Sleekplan:   ✗               ✗       ✗              ✗

Our unique angle: AI usage intelligence (from npm package)
Nobody else tracks developer AI prompts, responses, costs, and quality.
```

---

*EvaluateAI Comprehensive Plan v2 — April 6, 2026*
