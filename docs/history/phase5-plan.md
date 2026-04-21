# EvaluateAI — Phase 5+ Feature Plan

*Reference document for upcoming features beyond MVP (Phases 1-4 complete)*

---

## Feature 1: Fireflies Meeting Integration (High Priority)

**What it does:** Automatically captures meeting recordings and transcripts via Fireflies.ai webhooks.

**Flow:**
```
Manager connects Fireflies on /integrations page
        |
        v
Fireflies bot joins team meetings automatically
        |
        v
After meeting ends, Fireflies sends webhook to:
  POST /api/webhooks/fireflies
        |
        v
Webhook handler:
  1. Receives meeting transcript + metadata (title, date, participants, duration)
  2. Stores raw transcript in `meetings` table
  3. Maps participants to `team_members` by email
  4. Triggers AI task extraction (Feature 2)
        |
        v
Manager sees meeting appear on /meetings page
  - Title: "Monday Standup"
  - Participants: Adi, Jake, Priya, Sara
  - Duration: 25 min
  - Action items: 5 extracted
```

**Tables involved:** `integrations` (Fireflies token), `meetings` (transcript + metadata)

---

## Feature 2: AI Task Extraction from Meetings (High Priority)

**What it does:** Uses Claude Haiku to read meeting transcripts and automatically extract action items/tasks with assignees.

**Flow:**
```
Meeting transcript arrives (from Feature 1)
        |
        v
Claude Haiku API call with prompt:
  "Extract action items from this meeting transcript.
   For each, identify: task description, assignee name,
   priority, deadline (if mentioned)"
        |
        v
AI returns structured JSON:
  [
    { title: "Fix auth bug", assignee: "Adi", priority: "high", deadline: "Friday" },
    { title: "Add pagination to users list", assignee: "Priya", priority: "medium" },
    { title: "Setup monitoring dashboard", assignee: "Rob", priority: "low" }
  ]
        |
        v
System:
  1. Creates rows in `tasks` table (source: "meeting")
  2. Links each task to the meeting via `meeting_id`
  3. Matches assignee name -> `team_members.name` -> sets `assignee_id`
  4. Creates `activity_timeline` events (type: "task_assigned")
  5. Sets status = "pending"
        |
        v
Manager sees on /meetings page:
  Monday Standup -> 5 action items extracted
    - "Fix auth bug" -> assigned to Adi -> pending
    - "Add pagination" -> assigned to Priya -> pending
    - "Setup monitoring" -> assigned to Rob -> pending
```

**Tables involved:** `tasks` (new rows), `activity_timeline` (task_assigned events)

---

## Feature 3: Semantic Task-to-Commit Matching (High Priority)

**What it does:** Automatically matches code commits/PRs to meeting tasks using semantic similarity.

**Flow:**
```
GitHub webhook fires (commit or PR event)
        |
        v
System stores in `code_changes` table
        |
        v
Matching engine runs (on each new commit/PR):
  1. Get all open tasks for this developer
  2. Compare commit message + changed files against task descriptions
  3. Use keyword matching + Claude Haiku for semantic similarity
        |
        v
  When matched:
    1. Update task: status -> "in_progress" or "completed"
    2. Add commit SHA to `tasks.matched_changes[]`
    3. Set `code_changes.matched_task_ids[]`
    4. Set `code_changes.is_planned = true`
    5. Calculate `tasks.alignment_score`
    6. Create timeline event: "task_completed"
        |
        v
  When NO match:
    -> Mark commit as `is_planned = false` (unplanned work)
```

**Tables involved:** `tasks`, `code_changes`

---

## Feature 4: Meeting-to-Code Tracker Page (High Priority)

**What it does:** `/meetings` dashboard page showing: meeting -> extracted tasks -> code delivery status.

**Layout:**
```
/meetings page:
  - List of meetings with delivery rate per meeting
  - Each meeting expands to show extracted tasks
  - Each task shows: assignee, status, matched commits/PRs
  - Overall meeting-to-delivery conversion rate
```

---

## Feature 5: Jira/Linear Integration (Medium Priority)

**What it does:** Two-way sync between Jira/Linear and EvaluateAI tasks.

**Flow:**
- INBOUND: Jira webhook -> create/update `tasks` (source: "jira")
- OUTBOUND: When task-commit match detected -> transition Jira issue to "Done"

---

## Feature 6: Slack Notifications (Medium Priority)

Three notification types:
1. **Daily Digest** (9 AM cron) — team score, commits, AI spend, alerts
2. **Weekly Report** (Monday 9 AM) — sprint progress, per-dev breakdown
3. **Real-time Alerts** — immediate post on stale task, high cost, etc.

---

## Feature 7: Sprint View Page (Medium Priority)

`/sprints` page with planned vs actual delivery, burndown chart, AI cost per sprint.

---

## Feature 8: Stripe Billing (Medium Priority)

Subscription tiers: Free ($0, 3 devs), Team ($15/user/mo), Business ($29/user/mo), Enterprise (custom).

---

## Feature 9: Developer /my Pages (Low Priority)

Optional self-service pages: `/my/overview`, `/my/ai-sessions`, `/my/trends`.

---

## Feature 10: Email Digest via Resend (Low Priority)

Same as Slack digest, delivered via email.

---

## Feature 11: PDF Export (Low Priority)

Export weekly/sprint reports as PDF.

---

## Complete End-to-End Flow

```
Meeting (Fireflies) -> Tasks extracted (AI) -> Developer codes (CLI + GitHub)
  -> Matching engine links task <-> commits <-> AI sessions
  -> Daily cron aggregates -> Reports + Alerts
  -> Manager dashboard: /dashboard, /meetings, /developers, /reports, /alerts
  -> Notifications: Slack + Email
```

---

*EvaluateAI Phase 5+ Plan — April 10, 2026*
