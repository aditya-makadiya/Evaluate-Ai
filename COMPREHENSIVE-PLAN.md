# EvaluateAI — Developer Productivity Intelligence Platform
# Comprehensive Plan: Manager-First, Developer-Optional

---

## Executive Summary

A platform where **engineering managers get full visibility** into team productivity by automatically connecting:
- Meeting decisions → Assigned tasks → Code output → Delivery verification

**Developers don't need to do anything.** All data flows from existing tools (GitHub, Fireflies, Jira). The system watches, analyzes, and reports automatically.

Developers CAN optionally view their own dashboard for self-improvement, but it's not required.

---

## Part 1: Manager Experience (Primary)

### 1.1 What the Manager Sees

```
MANAGER DASHBOARD
│
├── Team Overview (daily pulse)
│   ├── Team health score: 78/100
│   ├── Active developers today: 7/8
│   ├── PRs merged: 12
│   ├── Tasks completed: 9/15
│   ├── Blocked items: 2
│   └── Unplanned work: 3 items (not from any meeting/ticket)
│
├── Meeting → Code Tracker
│   ├── Monday standup → 5 action items extracted
│   │   ├── ✅ "Fix auth bug" → PR #234 merged (Adi)
│   │   ├── ✅ "Add pagination" → PR #237 open (Priya)
│   │   ├── 🔄 "Refactor payment module" → 3 commits, no PR yet (Jake)
│   │   ├── ⚠️ "Update docs" → No code activity (Sara) — 3 days old
│   │   └── ❌ "Setup monitoring" → No activity at all (Rob) — 5 days old
│   │
│   ├── Sprint planning (Mar 31) → 12 action items
│   │   ├── 8 completed ✅
│   │   ├── 2 in progress 🔄
│   │   └── 2 dropped ❌ (no activity)
│   │
│   └── Filter by: meeting, developer, status, date range
│
├── Developer Profiles
│   ├── Adi (Senior Dev)
│   │   ├── This week: 14 commits, 3 PRs merged, 2 reviews
│   │   ├── Tasks assigned: 4, Completed: 3, In progress: 1
│   │   ├── Alignment score: 85/100
│   │   ├── Avg PR merge time: 4.2 hours
│   │   ├── AI usage: 40% of commits involved AI tools
│   │   ├── Code quality: 0 reverts, 2 review comments addressed
│   │   └── Work pattern: most active 10am-6pm
│   │
│   ├── Jake (Junior Dev)
│   │   ├── This week: 8 commits, 1 PR merged, 0 reviews
│   │   ├── Tasks assigned: 3, Completed: 1, Stuck: 1, Not started: 1
│   │   ├── Alignment score: 45/100 ⚠️
│   │   ├── Avg PR merge time: 18 hours (needs review help)
│   │   ├── AI usage: 75% (high dependency)
│   │   ├── Unplanned work detected: 5 commits not matching any task
│   │   └── ⚡ Insight: "Jake has 5 commits on /experiments/ — may be exploring instead of assigned work"
│   │
│   └── ... all team members
│
├── Alerts & Notifications (configurable)
│   ├── 🔴 "Task 'Setup monitoring' assigned to Rob has no activity for 5 days"
│   ├── 🟡 "Sprint is at 60% completion with 1 day remaining"
│   ├── 🟡 "Jake has 5 unplanned commits — may need task re-alignment"
│   ├── 🟢 "Adi merged 3 PRs today — highest output this week"
│   └── Deliver via: Slack DM to manager, email digest, dashboard
│
├── Reports
│   ├── Daily digest (auto-sent 9 AM)
│   │   ├── Yesterday's summary: who did what
│   │   ├── Tasks completed vs planned
│   │   └── Attention needed: blocked/dropped items
│   │
│   ├── Weekly report (auto-sent Monday 9 AM)
│   │   ├── Sprint progress
│   │   ├── Per-developer alignment scores
│   │   ├── Meeting → delivery conversion rate
│   │   ├── Trends: improving or declining
│   │   └── Top 3 recommendations
│   │
│   └── Sprint retrospective data
│       ├── What was planned vs what shipped
│       ├── Where time actually went
│       └── Estimation accuracy (planned effort vs actual)
│
└── Settings
    ├── Team members (invite, roles)
    ├── Integrations (GitHub, Fireflies, Jira, Slack)
    ├── Alert thresholds (when to notify)
    ├── Report schedule
    └── Privacy controls (what data to collect)
```

### 1.2 Manager Workflows

**Workflow A: Daily Check (2 minutes)**
```
Manager opens dashboard at 9 AM
  → Sees daily digest already in Slack
  → Glances at: team health score, any red alerts
  → Notices: "Setup monitoring — no activity 5 days (Rob)"
  → Clicks Rob's profile → sees no commits on that task
  → Sends Slack message: "Rob, need help with monitoring setup?"
  → Done. 2 minutes. No standup meeting needed.
```

**Workflow B: Sprint Review (10 minutes)**
```
End of sprint:
  → Opens sprint report
  → Sees: 12/15 tasks completed (80%)
  → 2 tasks dropped (never started)
  → 1 task still in progress
  → Sees: meeting → code conversion rate: 73%
  → Identifies: "Design review meeting had 5 items, only 2 got code"
  → Action: bring this up in retro
```

**Workflow C: Performance Review Data**
```
Quarterly review prep:
  → Opens developer profile for Adi
  → Sees 3-month trend: alignment 70% → 85% (improving)
  → 142 commits, 34 PRs, 28 reviews
  → Consistent delivery, no dropped tasks
  → AI usage: 35% (reasonable)
  → Data ready for review conversation — no opinion, just facts
```

---

## Part 2: Developer Experience (Optional)

### 2.1 Developer Doesn't Need to Do Anything

The system works entirely from system integrations:

```
DATA THE SYSTEM COLLECTS AUTOMATICALLY:
├── From GitHub (no developer action)
│   ├── Every commit: message, files, additions, deletions
│   ├── Every PR: title, description, reviewers, merge status
│   ├── Every review: comments given/received
│   └── Frequency, timing, repos
│
├── From Fireflies/Meeting Bot (no developer action)
│   ├── Meeting transcript
│   ├── AI-extracted action items
│   ├── Who was assigned what
│   └── Meeting duration and frequency
│
├── From Jira/Linear (no developer action)
│   ├── Tickets assigned
│   ├── Status changes
│   ├── Sprint membership
│   └── Story points
│
└── From Slack (optional, with team consent)
    ├── Public channel activity (not DMs)
    ├── Response time patterns
    └── Blocker mentions
```

**Developer does ZERO manual reporting.** No daily standups to write. No forms to fill.

### 2.2 What Developer CAN Optionally See

If a developer chooses to visit the dashboard:

```
DEVELOPER VIEW (optional, self-service)
│
├── My Work Summary
│   ├── Today: 5 commits, 1 PR opened, 2 reviews done
│   ├── This week: 14 commits, 3 PRs merged
│   └── Auto-generated summary of what I shipped
│
├── My Impact
│   ├── Lines of code: +2,400 / -800 this week
│   ├── Files touched: 34
│   ├── Repos: backend (60%), frontend (40%)
│   └── Complexity score: moderate
│
├── My Tasks
│   ├── From meetings: 4 assigned, 3 done ✅, 1 in progress 🔄
│   ├── From Jira: 5 tickets, 4 closed
│   └── Alignment score: 85/100 (I'm on track)
│
├── My Trends
│   ├── Productivity trend (commits/day over 30 days)
│   ├── PR cycle time (getting faster or slower?)
│   ├── Review participation
│   └── AI usage trend
│
└── My AI Usage (from EvaluateAI integration)
    ├── AI-assisted commits: 40%
    ├── Prompt quality score: 72/100
    ├── Top suggestion: "Include file paths in prompts"
    └── Tokens used this week: 89K ($0.84)
```

**Why a developer WOULD check voluntarily:**
- See their own stats for **performance reviews** ("I shipped 34 PRs this quarter")
- Track **personal improvement** trends
- Prepare for **1:1 meetings** with data
- **Promotion evidence**: "My alignment score is 90%+ consistently"

---

## Part 3: Intelligence Engine (How It Works)

### 3.1 Meeting → Task Extraction

```
INPUT: Meeting transcript from Fireflies
"...so Adi, can you take care of the auth bug that's blocking production?
 And Jake, the pagination feature needs to be done by Friday.
 Sara, please update the API docs once Jake's PR is merged..."

AI EXTRACTION:
┌─────────────────────────────────────────────────────────────────┐
│ Task 1: Fix auth bug blocking production                        │
│ Assignee: Adi                                                   │
│ Priority: High (blocking production)                            │
│ Deadline: ASAP (implied)                                        │
│                                                                 │
│ Task 2: Complete pagination feature                             │
│ Assignee: Jake                                                  │
│ Priority: Medium                                                │
│ Deadline: Friday                                                │
│                                                                 │
│ Task 3: Update API docs                                         │
│ Assignee: Sara                                                  │
│ Dependency: After Jake's PR merges                              │
│ Priority: Low                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Code → Task Matching

```
GITHUB WEBHOOK: New commit from Adi
  Message: "fix: resolve null ref in auth middleware (#234)"
  Files: src/auth/middleware.ts, src/auth/session.ts
  Additions: 23, Deletions: 8

MATCHING ENGINE:
  → Semantic similarity: "fix auth bug" ↔ "resolve null ref in auth middleware"
  → Similarity score: 0.87 (HIGH MATCH)
  → Result: Task 1 → IN PROGRESS (commit matched)

GITHUB WEBHOOK: PR #234 merged
  → Result: Task 1 → COMPLETED ✅
```

### 3.3 Daily Alignment Cron (12 AM)

```
CRON JOB RUNS DAILY AT 12 AM:

For each team member:
  1. Fetch all commits/PRs from today
  2. Fetch all assigned tasks (from meetings + Jira)
  3. Match commits → tasks using semantic similarity
  4. Identify:
     ├── ✅ Completed tasks (commit + PR merged)
     ├── 🔄 In progress (commits but no PR/merge)
     ├── ⚠️ No activity (assigned but no code)
     ├── 🔵 Unplanned work (commits not matching any task)
     └── 📊 Alignment score: matched_tasks / total_tasks × 100

  5. Generate daily report for manager
  6. Update alignment scores in database
  7. Send alerts if thresholds exceeded
  8. Sync to Supabase

OUTPUT: alignment_reports table updated
```

### 3.4 Scoring System

```
DEVELOPER ALIGNMENT SCORE (0-100):

  Task Completion (40% weight):
    completed_tasks / assigned_tasks × 100

  Code Activity (25% weight):
    commits_today > 0 ? 100 :
    commits_this_week > 0 ? 50 : 0

  PR Hygiene (15% weight):
    pr_merge_time < 24h ? 100 :
    pr_merge_time < 48h ? 70 :
    pr_merge_time < 72h ? 40 : 20

  Review Participation (10% weight):
    reviews_given >= 1/day ? 100 :
    reviews_given >= 3/week ? 70 : 30

  Planned vs Unplanned (10% weight):
    planned_commits / total_commits × 100
    (higher = more aligned with tasks)

TEAM HEALTH SCORE:
  avg(all developer alignment scores)
  + bonus for no dropped tasks
  - penalty for overdue items
```

---

## Part 4: Technical Architecture

### 4.1 System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         EXTERNAL SERVICES                            │
│                                                                      │
│  GitHub ──webhook──┐  Fireflies ──webhook──┐  Jira ──webhook──┐    │
│                    │                        │                   │    │
└────────────────────┼────────────────────────┼───────────────────┼────┘
                     │                        │                   │
                     ▼                        ▼                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    BACKEND (Node.js + Hono)                          │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ Webhook       │  │ OAuth        │  │ REST API               │  │
│  │ Handlers      │  │ Manager      │  │ /api/team/overview     │  │
│  │               │  │              │  │ /api/developers/:id     │  │
│  │ POST /webhook │  │ GET /auth/   │  │ /api/meetings          │  │
│  │   /github     │  │   github     │  │ /api/tasks             │  │
│  │   /fireflies  │  │   fireflies  │  │ /api/reports           │  │
│  │   /jira       │  │   jira       │  │ /api/alerts            │  │
│  └──────┬───────┘  └──────────────┘  └──────────────────────────┘  │
│         │                                                            │
│  ┌──────▼────────────────────────────────────────────────────────┐  │
│  │                    PROCESSING PIPELINE                         │  │
│  │                                                                │  │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐  │  │
│  │  │ Task Extractor │  │ Code Analyzer  │  │ Matcher Engine │  │  │
│  │  │ (Claude Haiku) │  │ (commit → AI   │  │ (task ↔ code   │  │  │
│  │  │                │  │  summary)      │  │  semantic sim.) │  │  │
│  │  └────────────────┘  └────────────────┘  └────────────────┘  │  │
│  │                                                                │  │
│  │  ┌────────────────────────────────────────────────────────┐   │  │
│  │  │ DAILY CRON (12 AM)                                      │   │  │
│  │  │ 1. Fetch day's commits per developer                    │   │  │
│  │  │ 2. Match commits → tasks                                │   │  │
│  │  │ 3. Calculate alignment scores                           │   │  │
│  │  │ 4. Generate reports                                     │   │  │
│  │  │ 5. Send alerts (Slack/email)                            │   │  │
│  │  │ 6. Update dashboard data                                │   │  │
│  │  └────────────────────────────────────────────────────────┘   │  │
│  └────────────────────────────────────────────────────────────────┘  │
│         │                                                            │
└─────────┼────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    SUPABASE (PostgreSQL)                              │
│                                                                      │
│  teams │ members │ integrations │ meetings │ action_items │         │
│  code_changes │ daily_reports │ alignment_reports │ alerts          │
│                                                                      │
│  + Row Level Security (manager sees team, dev sees own)             │
│  + Realtime subscriptions (live dashboard updates)                  │
│  + Edge Functions (cron jobs)                                       │
└─────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js)                                 │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ Manager Dashboard                                             │  │
│  │ ├── /dashboard        (team overview, health score)           │  │
│  │ ├── /meetings         (meeting → task tracker)                │  │
│  │ ├── /developers       (per-developer profiles)                │  │
│  │ ├── /developers/:id   (individual deep-dive)                  │  │
│  │ ├── /reports          (daily/weekly/sprint reports)            │  │
│  │ ├── /alerts           (notifications center)                  │  │
│  │ └── /settings         (integrations, team, thresholds)        │  │
│  │                                                                │  │
│  │ Developer Dashboard (optional, self-service)                  │  │
│  │ ├── /my/overview      (my work summary)                       │  │
│  │ ├── /my/tasks         (my assigned tasks + status)            │  │
│  │ ├── /my/trends        (my productivity trends)                │  │
│  │ └── /my/ai-usage      (AI tool usage from EvaluateAI)        │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 Database Schema

```sql
-- Teams
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  owner_id UUID REFERENCES auth.users(id),
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Team Members
CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT DEFAULT 'developer',  -- 'owner', 'manager', 'developer'
  github_username TEXT,
  jira_account_id TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, email)
);

-- Integrations
CREATE TABLE integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,        -- 'github', 'fireflies', 'jira', 'slack', 'linear'
  access_token TEXT,             -- encrypted
  refresh_token TEXT,            -- encrypted
  webhook_secret TEXT,
  config JSONB DEFAULT '{}',    -- repos list, channels, etc.
  status TEXT DEFAULT 'active',
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Meetings
CREATE TABLE meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  external_id TEXT,              -- Fireflies/Otter meeting ID
  title TEXT NOT NULL,
  date TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER,
  participants JSONB,            -- [{name, email}]
  transcript TEXT,               -- full transcript (encrypted)
  summary TEXT,                  -- AI-generated summary
  source TEXT NOT NULL,          -- 'fireflies', 'otter', 'manual'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Action Items (extracted from meetings OR Jira tickets)
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  meeting_id UUID REFERENCES meetings(id),  -- null if from Jira
  assignee_id UUID REFERENCES team_members(id),
  title TEXT NOT NULL,
  description TEXT,
  source TEXT NOT NULL,          -- 'meeting_extraction', 'jira', 'linear', 'manual'
  external_id TEXT,              -- Jira ticket ID
  priority TEXT DEFAULT 'medium',
  deadline TIMESTAMPTZ,
  status TEXT DEFAULT 'pending', -- 'pending', 'in_progress', 'done', 'dropped'
  status_updated_at TIMESTAMPTZ,
  matched_changes TEXT[],        -- code_change IDs that match this task
  alignment_score REAL,          -- 0-1, semantic match confidence
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Code Changes (from GitHub webhooks)
CREATE TABLE code_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  developer_id UUID REFERENCES team_members(id),
  type TEXT NOT NULL,            -- 'commit', 'pr_opened', 'pr_merged', 'pr_closed', 'review'
  external_id TEXT NOT NULL,     -- commit SHA or PR number
  repo TEXT NOT NULL,
  branch TEXT,
  title TEXT,                    -- commit message or PR title
  body TEXT,                     -- PR description
  files_changed INTEGER DEFAULT 0,
  additions INTEGER DEFAULT 0,
  deletions INTEGER DEFAULT 0,
  ai_summary TEXT,               -- AI-generated plain English summary
  matched_task_ids UUID[],       -- tasks this change relates to
  is_planned BOOLEAN,            -- does it match any task?
  created_at TIMESTAMPTZ NOT NULL
);

-- Daily Reports (auto-generated per developer)
CREATE TABLE daily_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  developer_id UUID REFERENCES team_members(id),
  date DATE NOT NULL,
  -- Auto-generated data
  commits_count INTEGER DEFAULT 0,
  prs_opened INTEGER DEFAULT 0,
  prs_merged INTEGER DEFAULT 0,
  reviews_given INTEGER DEFAULT 0,
  lines_added INTEGER DEFAULT 0,
  lines_removed INTEGER DEFAULT 0,
  files_touched INTEGER DEFAULT 0,
  repos_active TEXT[],
  ai_summary TEXT,               -- "Adi fixed the auth bug and started pagination"
  -- Task alignment
  tasks_assigned INTEGER DEFAULT 0,
  tasks_completed INTEGER DEFAULT 0,
  tasks_in_progress INTEGER DEFAULT 0,
  planned_commits INTEGER DEFAULT 0,
  unplanned_commits INTEGER DEFAULT 0,
  alignment_score REAL,          -- 0-100
  -- Generated at
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(developer_id, date)
);

-- Alignment Reports (team-level, daily cron output)
CREATE TABLE alignment_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  team_health_score REAL,        -- 0-100
  active_developers INTEGER,
  total_developers INTEGER,
  tasks_total INTEGER,
  tasks_completed INTEGER,
  tasks_in_progress INTEGER,
  tasks_pending INTEGER,
  tasks_dropped INTEGER,
  unplanned_work_count INTEGER,
  total_commits INTEGER,
  total_prs INTEGER,
  meeting_to_code_rate REAL,     -- % of meeting items that got code
  analysis JSONB,                -- AI insights
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, date)
);

-- Alerts
CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  type TEXT NOT NULL,            -- 'task_stale', 'sprint_risk', 'unplanned_work', 'high_performer'
  severity TEXT NOT NULL,        -- 'critical', 'warning', 'info', 'positive'
  title TEXT NOT NULL,
  description TEXT,
  developer_id UUID REFERENCES team_members(id),  -- null if team-wide
  task_id UUID REFERENCES tasks(id),
  is_read BOOLEAN DEFAULT FALSE,
  is_dismissed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_tasks_team_status ON tasks(team_id, status);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX idx_code_changes_developer ON code_changes(developer_id, created_at);
CREATE INDEX idx_code_changes_repo ON code_changes(team_id, repo);
CREATE INDEX idx_daily_reports_dev_date ON daily_reports(developer_id, date);
CREATE INDEX idx_alignment_reports_team ON alignment_reports(team_id, date);
CREATE INDEX idx_alerts_team ON alerts(team_id, is_read, created_at);
CREATE INDEX idx_meetings_team ON meetings(team_id, date);
```

### 4.3 Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | Next.js 15 + Tailwind + Recharts | Reuse EvaluateAI dashboard |
| Backend API | Hono on Vercel Edge or Railway | Fast, TypeScript, serverless-ready |
| Database | Supabase PostgreSQL | Already set up, RLS, realtime, edge functions |
| Cron Jobs | Supabase Edge Functions + pg_cron | Runs daily analysis at 12 AM |
| AI Analysis | Claude Haiku API | Task extraction, commit summarization, matching |
| Auth | Supabase Auth (GitHub OAuth + email) | Built-in, team-based |
| File Storage | Supabase Storage | Meeting transcripts, reports |
| Notifications | Slack API + Resend (email) | Alert delivery |
| Hosting | Vercel (frontend) + Supabase (backend) | Easy deployment |

---

## Part 5: Integration Details

### 5.1 GitHub Integration

```
SETUP: Manager connects GitHub org via OAuth
SCOPE: repo (read commits, PRs, reviews)

WEBHOOKS RECEIVED:
  push          → new commits (extract: SHA, message, files, additions/deletions, author)
  pull_request  → PR opened/merged/closed (extract: title, body, files, reviewers)
  pull_request_review → review submitted (extract: reviewer, state, body)

PROCESSING:
  1. Map GitHub username → team member
  2. Store in code_changes table
  3. AI summarize: "Fixed authentication bug by adding null check in middleware"
  4. Match against open tasks (semantic similarity)
  5. Update task status if match found

NO DEVELOPER ACTION NEEDED — webhook fires automatically on every push.
```

### 5.2 Fireflies Integration

```
SETUP: Manager connects Fireflies account
SCOPE: Read meetings, transcripts

WEBHOOK: meeting.completed
  → Receive: meeting_id, title, date, participants, transcript

PROCESSING:
  1. Store meeting + transcript in meetings table
  2. AI extraction prompt:
     "Extract all action items from this meeting transcript.
      For each item, identify: task description, assignee name, deadline (if mentioned), priority.
      Return as JSON array."
  3. Match assignee names → team members (fuzzy matching)
  4. Create task records in tasks table
  5. Notify manager: "5 action items extracted from Tuesday standup"

NO DEVELOPER ACTION NEEDED — Fireflies bot joins meetings automatically.
```

### 5.3 Jira/Linear Integration

```
SETUP: Manager connects Jira via OAuth
SCOPE: Read issues, boards, sprints

WEBHOOKS: issue_created, issue_updated, issue_deleted, sprint_started, sprint_completed

PROCESSING:
  1. Sync tickets → tasks table (source = 'jira')
  2. Map assignee → team member
  3. Track status changes (backlog → in progress → done)
  4. Link PRs to tickets (via branch name or PR description)
  5. Update alignment scores

BIDIRECTIONAL SYNC (optional):
  - Meeting action items → auto-create Jira tickets
  - Jira status changes → update task status in our system
```

### 5.4 Slack Integration

```
SETUP: Manager installs Slack app
SCOPE: Read public channels, send DMs (to manager only)

USES:
  1. SEND: Daily digest to manager as Slack DM
  2. SEND: Alerts when tasks are stale or sprint is at risk
  3. SEND: Weekly report to team channel
  4. READ (optional): Detect blocker mentions in public channels
     "I'm blocked on..." → create alert for manager

NO DEVELOPER ACTION NEEDED — bot only sends, doesn't require developer interaction.
```

---

## Part 6: Dashboard Pages (Detailed)

### Manager Pages

```
/dashboard                  Team Overview + Health Score
/dashboard/meetings         Meeting → Task Tracker
/dashboard/meetings/:id     Single Meeting: tasks, progress, participants
/dashboard/developers       All Developers Grid (cards with scores)
/dashboard/developers/:id   Developer Deep Dive (commits, tasks, trends, AI usage)
/dashboard/tasks            All Tasks (filterable by status, meeting, developer)
/dashboard/reports          Daily/Weekly/Sprint Reports
/dashboard/reports/:id      Single Report Detail
/dashboard/alerts           Notification Center
/dashboard/integrations     Connect GitHub, Fireflies, Jira, Slack
/dashboard/team             Team Members Management
/dashboard/settings         Thresholds, Notifications, Billing
```

### Developer Pages (Optional)

```
/my                         My Work Summary (today + this week)
/my/tasks                   My Assigned Tasks + Status
/my/trends                  My Productivity Trends (30/60/90 day)
/my/ai-usage                My AI Tool Usage (from EvaluateAI)
```

---

## Part 7: Implementation Timeline

### Phase 1: Foundation + GitHub (Weeks 1-3)

```
Week 1:
├── Supabase project setup (schema, RLS, auth)
├── Next.js app with auth (login, team creation)
├── GitHub OAuth + webhook receiver
├── Code change ingestion (commits, PRs)
└── MILESTONE: GitHub connected, commits in DB

Week 2:
├── AI commit summarizer (Claude Haiku)
├── Developer profile page (commits, PRs, activity)
├── Team overview page (basic stats)
├── Invite system (email invites to team)
└── MILESTONE: Manager can see team's GitHub activity

Week 3:
├── Daily cron job (aggregate per-developer daily stats)
├── Daily report generation (auto-summary per developer)
├── Manager daily digest (Slack/email)
├── Basic alignment score (code activity only)
└── MILESTONE: Auto-generated daily reports working
```

### Phase 2: Meeting Intelligence (Weeks 4-6)

```
Week 4:
├── Fireflies OAuth + webhook integration
├── Meeting ingestion pipeline
├── AI task extraction from transcripts
├── Meeting detail page
└── MILESTONE: Meeting action items auto-extracted

Week 5:
├── Task → Code matching engine (semantic similarity)
├── Meeting → Code tracker page
├── Task status tracking (pending → done)
├── Alignment scoring (meeting tasks vs code)
└── MILESTONE: "3/5 meeting items have code" visible

Week 6:
├── Alerts system (stale tasks, sprint risk)
├── Notification delivery (Slack DM + email)
├── Sprint view (all tasks, progress %)
├── Polish + error handling
└── MILESTONE: Full meeting → code → verification working
```

### Phase 3: Advanced Intelligence (Weeks 7-9)

```
Week 7:
├── Jira/Linear integration
├── Bidirectional task sync
├── Weekly report generation
├── Team health score refinement
└── MILESTONE: Three-way match: meeting + Jira + code

Week 8:
├── Developer deep-dive page (full profile)
├── Trends and historical data
├── Unplanned work detection and reporting
├── Manager comparison view (team grid)
└── MILESTONE: Complete manager dashboard

Week 9:
├── Developer optional dashboard (/my pages)
├── EvaluateAI integration (AI usage per developer)
├── Export functionality (CSV, PDF reports)
├── Mobile-responsive design polish
└── MILESTONE: Both manager and developer views complete
```

### Phase 4: Launch (Weeks 10-12)

```
Week 10:
├── Landing page + marketing site
├── Documentation + onboarding flow
├── Billing integration (Stripe)
├── Free tier limits implementation
└── MILESTONE: Product ready for beta

Week 11:
├── Security audit (encryption, RLS verification)
├── Performance optimization
├── Error monitoring (Sentry)
├── Beta testing with 5 teams
└── MILESTONE: Beta feedback collected

Week 12:
├── Fix beta issues
├── Product Hunt launch
├── Content marketing (blog posts, Twitter)
├── First 20 paying teams target
└── MILESTONE: Public launch
```

---

## Part 8: Pricing

| Tier | Price | Team Size | Features |
|------|-------|-----------|----------|
| **Starter** | Free | Up to 3 devs | GitHub only, basic reports, 1 repo |
| **Team** | $15/user/mo | 5-25 devs | All integrations, meetings, alignment, 10 repos |
| **Business** | $29/user/mo | 25-100 | Custom reports, API access, Jira, unlimited repos |
| **Enterprise** | Custom | 100+ | SSO, audit logs, on-prem, SLA, dedicated support |

**Unit economics:**
- Cost per user: ~$0.50/mo (Supabase + Haiku API)
- Gross margin: ~96% at Team tier
- Break-even: 15 paying users

---

## Part 9: Key Metrics to Track

| Metric | Target | How |
|--------|--------|-----|
| Teams onboarded (free) | 100 in 3 months | Product Hunt + content |
| Free → Paid conversion | 15% | Limit free tier strategically |
| Monthly churn | <5% | Deliver visible value weekly |
| Meeting → Code rate | Track improvement | Show teams they're getting better |
| Daily active managers | 70% of paid users | Dashboard + Slack digest |
| NPS | >50 | Survey after 30 days |

---

*EvaluateAI Comprehensive Plan v1.0 — April 6, 2026*
