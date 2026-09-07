# Redesign baseline — what must survive

Snapshot of the shipped app taken before applying the Claude Design
"Personal OS Redesign" pass. The redesign changes presentation only.
Every route, control and filter below must still exist and behave
identically afterwards. Use this as the verification checklist.

## Routes

| Route | Screen component | Notes |
| --- | --- | --- |
| `/` | `src/app/page.jsx` → landing/* | hero, why, pillars, fragments, privacy, closing |
| `/login`, `/signup` | `(auth)/*/page.jsx` | `login-form.jsx` |
| `/app` | `patterns/discoveries-screen.jsx` | Discoveries feed — the app's front door |
| `/app/discoveries` | `patterns/discoveries-archive.jsx` | full archive |
| `/app/discoveries/[id]` | `patterns/insight-detail.jsx` | evidence chart, stats |
| `/app/today` | `app/today/page.jsx` (316 lines, inline) | Lifeline + 5 summary cards |
| `/app/journal` | `journal/journal-screen.jsx` | anchor card, quick notes, calendar sidebar |
| `/app/budget` | redirects → `/app/budget/expenses` | `budget/layout.jsx` wraps all four |
| `/app/budget/expenses` | `budget/expense-list.jsx` | **heaviest filter surface** |
| `/app/budget/plan` | `budget/budget-plan-screen.jsx` / `budget-tab.jsx` | |
| `/app/budget/debts` | `budget/debt-tab.jsx` | |
| `/app/budget/goals` | `budget/financial-goals-tab.jsx` | |
| `/app/goals` | `compass/compass-client.jsx` | habits heatmap + goals + weekly goals |
| `/app/goals/[goalId]` | `compass/goal-detail-client.jsx` | milestones |
| `/app/planner` | `planner/planner-screen.jsx` | week grid, calendar, history |
| `/app/portfolio` | `vault/vault-client.jsx` | |
| `/app/portfolio/import` | `vault/import-client.jsx` | CSV import |
| `/app/portfolio/sip` | `vault/sip-manager.jsx` | |
| `/app/review` | weekly briefing | |
| `/app/weekly` | weekly goals | |

## Filters and controls that must not be lost

**Expenses** (`expense-list.jsx:86-155`)
- Debounced (250 ms) search box `q` over notes
- `categoryId` select, `paymentMethod` select
- `dateFrom` / `dateTo` range, with month-pager (prev/next clamped to
  earliest expense and current month)
- `sort`: `date_desc` and friends; day grouping only while sorting by date
- `showFilters` disclosure + active-filter count badge; month-pager dates
  deliberately excluded from that count
- Deep-link support: `?dateFrom=&dateTo=` from discovery evidence rows
- `clearFilters()` resets q/category/method/dates

**Discoveries archive** (`discoveries-archive.jsx:34-58`)
- `status` filter (active / all / dismissed …), default `active`
- `domain` filter, derived from the insights present, hidden when ≤1
- `sort`: `strength` (rankFeed) / `recent` / `first`
- Dismissed rows render as `HiddenRow` with restore

**Planner** (`planner-screen.jsx:36-39`)
- `view` week/other toggle, `showCalendar`, `query` search, `filter` (all/…)
- Week shifting, optimistic toggles with per-goal pending guard,
  debounced (600 ms) refresh of calendar + history tallies
- History `range` selector (`planner-history.jsx:15,36`)

**Journal** — `calendar-sidebar.jsx`: `viewMonth` pager, `query` full-text search.

**Budget shared** — category manager (create/edit/delete with reassign),
budget period weekly|monthly, running-total bar, budget alert.

## Navigation (must stay identical)

Sidebar `NAV` (`sidebar.jsx:32-49`): Discoveries `/app`, Today, Journal,
Money (children: Expenses, Budget, Debts, Goals), Habits & Goals, Planner,
Portfolio. `isActivePath` gives `/app` to Discoveries **and**
`/app/discoveries*`, never `/app/today`.

Bottom nav (`bottom-nav.jsx:27-37`, md and below): tabs Discover / Money /
Journal + More sheet (Today, Goals & habits, Planner, Portfolio), profile,
theme toggle, install button, sign out.

## Design tokens in play

`src/app/globals.css` — dark-first HSL token set (Ink / Surface / Line /
Brass accent / positive / negative), `.dark` overrides, `--radius 0.625rem`.
`tailwind.config.js` — `brand`, `positive`, `negative` colors; `display`/`body`
font families; keyframes fade-in, slide-up, dialog-in/out, overlay-in/out,
check-pop, accordion. Utilities: `.tnum`, `.scrollbar-thin`, `.text-balance`,
`.lifeline-bar`. Inputs forced to 16px below `sm` to stop iOS zoom;
`prefers-reduced-motion` kills animation.

Any redesign must keep these token names, or update every consumer.
