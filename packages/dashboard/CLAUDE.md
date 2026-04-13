# Dashboard — UI Rules & Design System

## Design System — STRICT Rules

### Theme

The dashboard supports dark and light themes via CSS custom properties.
**NEVER hardcode hex colors.** Always use CSS variables:

```
BACKGROUNDS:
  bg-bg-primary       Main background
  bg-bg-secondary     Slightly elevated
  bg-bg-card          Cards, panels
  bg-bg-elevated      Hover states, modals

BORDERS:
  border-border-primary   Default borders
  border-border-hover     Hover state borders

TEXT:
  text-text-primary       Main text
  text-text-secondary     Secondary text
  text-text-muted         Muted, labels, timestamps

BRAND (constant across themes):
  #8b5cf6   Purple (primary accent)
  #3b82f6   Blue (secondary accent)
```

**DO NOT USE:** `bg-[#141414]`, `text-[#ededed]`, `border-[#262626]` or any hardcoded hex in Tailwind classes.
**DO NOT USE:** `bg-[var(--bg-card)]` — use canonical Tailwind v4 syntax instead (e.g., `bg-bg-card`).
**INSTEAD USE:** `bg-bg-card`, `text-text-primary`, `border-border-primary` (registered in `@theme inline` in globals.css)

### Score Colors (always these, both themes)

```
80-100:  emerald-400/emerald-900   "Excellent"
60-79:   blue-400/blue-900         "Good"
40-59:   yellow-400/yellow-900     "Needs Work"
0-39:    red-400/red-900           "Poor"
```

### Intent Badge Colors (always these)

```
research:  purple-400   bg-purple-900/30
debug:     red-400      bg-red-900/30
feature:   green-400    bg-green-900/30
refactor:  blue-400     bg-blue-900/30
review:    yellow-400   bg-yellow-900/30
generate:  cyan-400     bg-cyan-900/30
config:    orange-400   bg-orange-900/30
```

### Typography

```
Page titles:     text-2xl font-bold tracking-tight
Section titles:  text-lg font-semibold
Card headers:    text-sm font-semibold uppercase tracking-wider
Body text:       text-sm
Small/labels:    text-xs
Monospace:       font-mono (for code, costs, tokens)
```

### Spacing

```
Page padding:       px-8 py-6
Card padding:       p-5 (standard), p-6 (large sections)
Card gap:           gap-4 (between cards), gap-6 (between sections)
Section margin:     mb-8 (between page sections)
Inner element gap:  gap-2 (tight), gap-3 (normal), gap-4 (loose)
```

### Card Component Pattern

Every card follows this pattern:
```tsx
<div className="bg-bg-card border border-border-primary rounded-lg p-5 hover:border-border-hover transition-colors">
  {/* content */}
</div>
```

### Buttons

```
Primary:     bg-purple-600 hover:bg-purple-500 text-white rounded-lg px-4 py-2
Secondary:   border border-border-primary bg-bg-card hover:bg-bg-elevated
Destructive: bg-red-900/30 text-red-400 hover:bg-red-900/50
Ghost:       text-text-muted hover:text-text-primary hover:bg-bg-elevated
```

### Charts (Recharts)

```
Tooltip style:
  contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12 }}

Grid: stroke="var(--border-primary)" or #1a1a1a for dark-only subtle grid
Axis tick: { fill: 'var(--text-muted)', fontSize: 11 }
Chart colors: use brand purple (#8b5cf6), blue (#3b82f6), cyan (#06b6d4), green (#22c55e)
```

### Loading States

Always show loading skeleton, never empty/blank screen:
```tsx
// Skeleton pattern
<div className="animate-pulse">
  <div className="h-4 bg-bg-elevated rounded w-32 mb-2" />
  <div className="h-8 bg-bg-elevated rounded w-48" />
</div>
```

Or use `.shimmer` CSS class for animated gradient skeleton.

### Empty States

Always show a helpful message with icon and action:
```tsx
<div className="flex flex-col items-center justify-center py-16 text-center">
  <Icon className="w-10 h-10 text-text-muted mb-3" />
  <p className="text-sm text-text-secondary">No data yet</p>
  <p className="text-xs text-text-muted">Helpful next step here</p>
</div>
```

### Error States

```tsx
<div className="bg-red-900/20 border border-red-800/50 rounded-lg p-5 text-red-300 text-sm">
  Failed to load: {error}
</div>
```

## Page Structure Rules

1. Every page is `'use client'`
2. Every page fetches data in `useEffect` with loading/error states
3. Every page has: loading skeleton → error state → empty state → data view
4. Use `fetch('/api/...')` for data — API routes read from SQLite/Supabase
5. Stagger section animations with `.animate-section` class
6. All pages are responsive: 2-col on desktop, stack on mobile

## Component Rules

1. Components go in `src/components/`
2. One component per file
3. Props interface defined above the component
4. Handle null/undefined data gracefully — never crash on missing data
5. Use lucide-react for icons (not heroicons, not fontawesome)
6. Use Recharts for all charts (not chart.js, not d3 directly)

## API Route Rules

1. API routes go in `src/app/api/`
2. Use `@supabase/supabase-js` for all database queries — no SQLite, no better-sqlite3
3. Import Supabase client from `@/lib/supabase`
4. Return `NextResponse.json(data)`
5. Handle Supabase errors gracefully — return empty data, not 500 errors
6. Use camelCase in JSON responses (Supabase returns snake_case — transform in API routes)

## Do NOT

- Do not use shadcn/ui (we use plain Tailwind)
- Do not use framer-motion (use CSS animations)
- Do not import from `@evaluateai/core` in dashboard (use API routes + Supabase client)
- Do not use better-sqlite3 or SQLite anywhere in the dashboard
- Do not add new npm dependencies without approval
- Do not use `className` strings longer than 200 chars — extract to a variable
- Do not use inline `style={}` unless required for dynamic values (charts)
- Do not create component files with more than 400 lines — split into sub-components
