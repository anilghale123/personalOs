# selfView Implementation — Handoff

**Read `newplan.md` first.** That is the full design blueprint. This file is the status report on top of it.

**Status: Phases 1–7 are complete.** `npm test` → 8 files, 206 tests. `npm run build` → clean. `npm run lint` → no warnings.

---

## Environment facts confirmed (§12 checklist in newplan.md)

- Next.js `14.2.35`, App Router, JS (no TypeScript). React 18.
- `date-fns@4.1.0`, `mongoose@9.6.2`, `groq-sdk@1.2.0`, `zustand@5.0.13`, `recharts@3.8.1`, `next-auth@5.0.0-beta.31`.
- `vercel.json` still has exactly one cron slot: `/api/cron/scrape-nepse`. **No second cron was added** — the blueprint marks the weekly cron optional and prefers lazy-with-TTL, which is what shipped.
- `.env.local` has `MONGODB_URI`, `AUTH_SECRET`/`NEXTAUTH_SECRET`, `GROQ_API_KEY`, `AUTH_GOOGLE_ID/SECRET`, `CRON_SECRET`.
- `vitest@^4.1.11` is the only dev dependency added. **Zero new runtime dependencies** across all seven phases.

### The vitest cwd bug (fixed, do not bypass the wrapper)

Vitest compares test-file import ids (realpath'd, uppercase `C:` on Windows) against paths derived from `process.cwd()`. Git-bash often reports a lowercase drive (`c:\...`), the comparison misses, and the test file gets a second copy of `@vitest/runner` whose module-level state is never set — surfacing as `TypeError: Cannot read properties of undefined (reading 'config')` at the first `describe`.

`scripts/vitest.mjs` re-executes vitest from the realpath'd project root and entry file. Always run through `npm test`; never `npx vitest` from a lowercase-cwd shell.

---

## Phase 1 — Foundation

| File | What it is |
|---|---|
| `features/patterns/constants.js` | Thresholds, mood scale, statement templates, caveats, ranking weights, readiness config. |
| `features/patterns/dates.js` | Pure date-key calendar arithmetic. Encodes the §2.3 normalisation rules — **never reintroduce `toDateKey()`/`toISOString()` into the signal layer.** |
| `features/patterns/signals.js` | `getDailySignals` (DB) + `buildDailySignals` (pure) + `computeCoverage`. |
| `api/patterns/readiness/route.js` | Per-domain coverage over 30/90-day windows. |
| `api/ai/briefing/route.js` | **MODIFIED**: reads `Expense`/`Category` so the briefing sees everyday spending, not just NEPSE trades. Still live but superseded for the weekly screen by `/api/ai/weekly`. |

`signals.test.js` holds the mandatory UTC-midnight-vs-local date-boundary test and the mood-enum/schema match.

## Phase 2 — Pattern Engine

11 Tier-1 detectors across 6 families, plus the engine pipeline: coverage gate → detectors → BH-FDR → effect floors → outlier leave-one-out → confidence banding → family cap → ranking.

**P-values are exact permutation tests** (`permutationPGroups`, `permutationPCorrelation`, `permutationPKruskal`), seeded from the data so they're reproducible run-to-run. The original normal approximations were liberal on mood — a 5-point ordinal scale with heavy ties — and on pure noise at 45/60/90-day windows produced corrected false-finding rates of 14%/14%/10%. Permutation brought that to 8%/9%/10% while uncorrected noise still fired on 46–62% of runs. Parametric values are retained in `summary` for reporting only.

`engine.test.js` carries two null tests (200-day and 60-day windows), planted-pattern tests, suppression tests, and a determinism test.

## Phase 3 — Persistence

`Insight` (one doc per userId+fingerprint, unique index) and `PatternRun`. `persist.js` holds the pure planners — `buildHistoryMap`, `planPersistence`, `gateRun`, `buildSuppressionSet` — and a thin DB shell. Upsert-by-fingerprint is what makes confidence-through-time, pattern history and the weekly check-in possible. **Nothing is ever hard-deleted**; dismissal is a status change.

Routes: `POST /api/patterns/run` (TTL-gated, manual cap), `GET /api/patterns/insights`, `GET|PATCH /api/patterns/insights/[id]`.

## Phase 4 — Discoveries UI

- `app/app/page.jsx` is now **Discoveries**; the old dashboard moved **unchanged** to `app/app/today/page.jsx`.
- `app/app/discoveries/page.jsx` (archive) and `app/app/discoveries/[id]/page.jsx` (detail).
- `features/patterns/feed.js` — **read-time** ranking. The engine's rank score can't be stored and left alone, because it has to keep changing as the user reads, rates and hides things. This fixes a gap in Phase 3, where the feed sorted by confidence-then-recency and ignored ranking entirely.
- Components: `discoveries-screen`, `discoveries-archive`, `insight-card`, `insight-detail`, `evidence-chart`, `confidence-pill`, `data-readiness`.
- `store.js` (Zustand, not persisted — insights are server truth), `actions.js` (server fetchers).
- Nav rewired: sidebar (Discoveries first, "Modules" label dropped), bottom-nav (Discover/Money/Journal + More), mobile-topbar label.
- All five states designed and reachable: empty, insufficient, computing, results, nothing-found — plus stale insights in the archive.

**Evidence deep-links are real, not decorative.** `?date=` was added to the journal page and `?dateFrom/?dateTo` seeding to `ExpenseList` (both small additive changes), so a contributing-day row actually lands on the day it was computed from.

## Phase 5 — AI narration

`features/patterns/narrate.js`. The model receives finished numbers and returns prose; it never sees raw journal text or expense rows.

Two mechanical guards, not just prompt instructions:
- `assertNoInventedNumbers` — every numeric token must be a rounding of something in the payload. Retry once, then fall back to the deterministic template.
- `assertNoCausalClaims` — the same banned-term list the templates are tested against.
- `assertHedged` — used for the "why might this be?" role *instead of* the causal-verb ban, because that role is supposed to raise mechanisms; what matters is that each is offered as a possibility.

`POST /api/patterns/insights/[id]/narrate` (`mode: narrate|explain`, `regenerate`). Results persist to `Insight.narration` / `Insight.explanation` and are not regenerated per view. **Narration never appears on feed cards** — the feed works with Groq down.

## Phase 6 — Weekly Discoveries

- `app/app/weekly/page.jsx`; `/app/review` now redirects (keep for one release).
- `features/patterns/weekly.js` — pure `classifyCheckIn` (new/held/strengthened/weakened/faded), `summariseWeek`, `buildWeeklyDigest`.
- `POST /api/ai/weekly` — builds the digest deterministically, asks for prose, holds the reply to the same numeric and causal guards.
- `features/review/components/weekly-client.jsx` — the six-section layout. `PlannerReviewSummary` unchanged. Per-goal star rating gone from the UI; `WeeklyGoal.evaluation.rating` retained in schema. The free-text box still writes to `WeeklyGoal.evaluation.reflection`.
- `review-client.jsx` was deleted (superseded).

## Phase 7 — Feedback and personalisation

- **Suppression**: `buildSuppressionSet` — "I already knew this", or hiding twice (`Insight.dismissCount`), stops a pattern surfacing. It is still tested and still accumulates history; it's rejected *after* FDR so it stays counted in the correction.
- **Feedback ranking**: handled at read time in `feed.js` (see Phase 4).
- **Journal extraction**: `features/patterns/extract.js` + `POST /api/journal/extract`. `DailyJournal.signals` is additive/optional. Parsing is paranoid — fences, commentary, invented enums, and braces inside strings are all handled, and anything that doesn't validate is **discarded rather than stored**.
- **Sentiment detectors**: `detectors/sentiment.js` — variants of A1/C1/A3 using `signals.sentiment`. They only run for users who opted in; otherwise the coverage gate skips the family.
- **Privacy**: `User.preferences.journalExtraction`, default **false**. Profile dialog has a Privacy tab; the toggle saves immediately rather than behind a Save button. The landing page's privacy copy was corrected — it previously claimed "nothing is sent anywhere else, ever unprompted", which extraction would have made false.
- **Backfill**: `scripts/backfill-journal-signals.mjs` — opt-in-gated, idempotent, resumable, rate-limited. Run with `node --env-file=.env.local` (no dotenv dependency).

---

## Deliberate deviations from the blueprint

Each of these is a considered choice, not an oversight:

1. **`requires` names coverage domains, not signal fields.** The blueprint sketched `requires: ['moodScore', 'spendWantPaisa']`. Counting non-null fields would gate on the wrong thing — `spendWantPaisa` is `0`, not null, on a day with nothing logged, so a field-based gate reports full money coverage for someone who has never opened the expenses screen.
2. **Detectors may return `{ results, hypothesesTested, skipped }`, not just an array.** Parameterised detectors trim to the strongest three; without reporting the true test count, the FDR correction would be applied across only the survivors it had already filtered on.
3. **P-values are permutation-based.** See Phase 2 — the blueprint's Mann–Whitney/Spearman-t are too liberal on tied ordinal data at these sample sizes.
4. **No dedicated `/feedback` route.** `PATCH /api/patterns/insights/[id]` already handles ratings; a second endpoint would duplicate mutation logic.
5. **Tier-1 is 12 detectors, not 11.** The blueprint says 11 but marks 12 as Tier 1 (A1–A3, B1, C1–C2, D1–D3, E1–E2, F1); D3 emits two hypotheses (same-day and lag-1). Sentiment adds 3 more in Phase 7.
6. **Quick-log is mood-only.** Mood is the binding constraint on the engine, so it got a real one-tap control; expenses and habits link to their existing screens rather than cloning their dialogs into the home page.
7. **Two extra signal fields** beyond §2.2 — `spendTotalManualPaisa` / `spendWantManualPaisa` (recurring excluded), needed by E1 and A3 so rent and subscriptions aren't read as discretionary behaviour.
8. **No weekly cron.** Optional in the blueprint, and one Vercel slot is already used. Lazy-with-TTL covers it.

## Not done (Tier 2, explicitly out of scope)

A4, B2, B3, C3, D4, D5, E3, F2 — all marked Tier 2 in §4 and deferred until coverage supports them.

---

## Things to NOT do (standing rules, still binding)

- No TypeScript. No new runtime dependencies.
- No existing Mongoose schema field or collection renamed. Additive optional fields only.
- Never let the LLM compute, estimate or infer a number, or decide whether a pattern is real.
- Money stays integer paisa everywhere.
- `toDateKey()` semantics for real timestamps only (`Transaction`, `WeeklyGoal`); the UTC-midnight round-trip in `dates.js` for anything joining against `HabitLog`. Re-read §2.3 before touching date logic.

## Orientation

```
npm test         # via scripts/vitest.mjs wrapper
npm run build
npm run lint
```

Read in this order: `newplan.md`, this file, then `features/patterns/engine.js` (the pipeline), `features/patterns/persist.js` (how findings become durable), `features/patterns/feed.js` (how they get ordered for a human).
