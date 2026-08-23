# selfView — Personal Pattern Intelligence
## Implementation Blueprint

**Status:** Blueprint. No code to be written from this document directly — each phase below is designed to be lifted out as a standalone coding prompt.

**Codebase reference:** `src.zip` — Next.js App Router (JS), MongoDB/Mongoose, NextAuth, Groq, Zustand, Tailwind + shadcn-style primitives, PWA. 16 models, 38 API routes, 7 nav sections.

---

## How to use this document

Sections 1–8 are **design**. Section 9 is the **phased roadmap**, and each phase there is written to be self-contained: copy the phase, prepend the Standing Rules below, and hand it to a coding agent.

### Standing Rules (prepend to every phase prompt)

```
You are working in an existing, working Next.js + Mongoose codebase.

DO NOT:
- Rebuild or refactor existing finance, habit, journal, planner or portfolio code
- Change any existing Mongoose schema field or collection name
- Introduce TypeScript (this project is JavaScript)
- Add runtime dependencies without explicit approval
- Let the LLM compute, estimate, or infer any number
- Let the LLM decide whether a pattern is real

DO:
- Reuse lib/money.js, lib/utils.js (toDateKey), lib/week.js, lib/mongoose.js, lib/auth.js, lib/groq.js
- Follow the existing features/<domain>/{actions,store,constants,components} convention
- Follow the existing route convention: app/api/<domain>/<resource>/route.js
- Keep all money in integer paisa; never introduce floats into money math
- Use toDateKey() for local calendar dates — never toISOString() for user-facing dates
- Add only additive, optional schema fields
```

### Non-negotiable data flow

```
existing collections
  → normalized daily signals        (deterministic)
  → statistical detectors           (deterministic)
  → validated patterns + evidence   (deterministic)
  → persisted Insight documents     (deterministic)
  → LLM narration                   (language only, zero arithmetic)
  → Discoveries UI
```

The LLM enters at the second-to-last step and never earlier.

### One caveat about this blueprint

Only `src/` was uploaded — there is no `package.json` in what I inspected. Dependency versions, the Next.js major version, and the existing cron configuration in `vercel.json` are inferred from usage, not verified. **Check these before Phase 1.** Everything else in this document is grounded in files I read.

---

# 1. Architecture overview

## 1.1 New module

Everything new lives in one feature folder, matching the existing convention:

```
src/features/patterns/
  constants.js        # mood scale, thresholds, confidence bands, detector registry
  signals.js          # Daily Signal Layer (server-only, DB access)
  stats.js            # pure statistics — no DB, no imports, fully unit-testable
  engine.js           # orchestrates detectors, applies FDR correction, ranks
  fingerprint.js      # stable insight identity
  narrate.js          # LLM narration + numeric guardrail
  actions.js          # "use server" — page data fetchers
  store.js            # Zustand client store (matches journal/budget stores)
  detectors/
    index.js          # registry
    money-mood.js
    money-habits.js
    habits-mood.js
    journal-cross.js
    rhythm.js
    budget-behaviour.js
  components/
    discoveries-screen.jsx
    insight-card.jsx
    insight-detail.jsx
    evidence-chart.jsx
    confidence-pill.jsx
    data-readiness.jsx
    weekly-discoveries.jsx
```

**Why `signals.js` is not `"use server"`:** it needs to be callable from both API routes and server actions. `features/budget/summary.js` already establishes exactly this pattern — follow it.

## 1.2 New models

| Model | File | Purpose |
|---|---|---|
| `Insight` | `src/models/Insight.js` | A validated, persisted pattern with evidence, history and feedback |
| `PatternRun` | `src/models/PatternRun.js` | Audit log of engine executions — debugging, TTL gating, cost control |

No existing model changes shape. Two additive optional field groups are proposed (§5.4, §7.4).

## 1.3 New API routes

| Route | Method | Purpose |
|---|---|---|
| `app/api/patterns/run/route.js` | POST | Run the engine for the current user (TTL-gated) |
| `app/api/patterns/insights/route.js` | GET | List insights (filter by status) |
| `app/api/patterns/insights/[id]/route.js` | GET, PATCH | Detail; dismiss/restore |
| `app/api/patterns/insights/[id]/feedback/route.js` | POST | useful / not useful / already knew |
| `app/api/patterns/insights/[id]/narrate/route.js` | POST | Generate or regenerate LLM narration |
| `app/api/patterns/readiness/route.js` | GET | Data-sufficiency report for empty states |
| `app/api/ai/weekly/route.js` | POST | Weekly Discoveries digest (replaces briefing's role) |
| `app/api/journal/extract/route.js` | POST | Journal signal extraction → structured fields |

## 1.4 Dependencies

**Recommended: zero new runtime dependencies.**

Everything statistical needed here — Pearson, Spearman, Welch's t-test, Mann–Whitney U, Benjamini–Hochberg, Cliff's delta — is roughly 200 lines of well-understood code. Hand-rolling keeps the supply chain clean and makes every function directly unit-testable, which matters more here than anywhere else in the app because these functions decide what the product tells the user is true.

- **Dev dependency:** `vitest` — required. See §9 testing.
- **Optional alternative:** `simple-statistics` if you'd rather not hand-roll. If you take it, still write the null tests.
- Already present and reused: `date-fns`, `recharts`, `zustand`, `sonner`, `lucide-react`, `groq-sdk`, `mongoose`, `next-auth`.

---

# 2. Daily Signal Layer

The join key for everything. Nothing else in this blueprint works without it.

## 2.1 Contract

**File:** `src/features/patterns/signals.js` — server-only, not `"use server"`.

```js
/**
 * @returns {Promise<DailySignal[]>} one row per calendar day, ascending,
 *          including days with no activity (gaps must be explicit).
 */
export async function getDailySignals(userId, from, to)
```

`from`/`to` are `'YYYY-MM-DD'` local date keys.

## 2.2 DailySignal shape

```js
{
  date: '2026-08-14',
  dow: 0,                    // 0 = Monday, matching weekStartsOn: 1
  isWeekend: false,
  dayOfMonth: 14,

  // ── money (integer paisa, from Expense where deletedAt: null)
  spendTotalPaisa: 245000,
  spendNeedPaisa: 180000,
  spendWantPaisa: 65000,
  spendSavingsPaisa: 0,
  spendByCategoryId: { '66f...': 65000 },
  expenseCount: 4,
  largestExpensePaisa: 120000,
  hasMoneyData: true,        // true if the user logged ANY expense that day

  // ── mood (DailyJournal.mood)
  mood: 'good',
  moodScore: 4,              // null when unset — never impute
  hasMood: true,

  // ── journal
  journalWords: 143,
  hasJournal: true,
  noteCount: 3,
  noteCountByType: { note: 2, idea: 0, task: 0, gratitude: 1 },

  // ── habits (HabitLog)
  habitsTracked: 4,
  habitsDone: 3,
  habitRate: 0.75,           // null when habitsTracked === 0
  habitByName: { 'Morning Run': true, 'Reading': false },

  // ── planner (PlannerGoal) — secondary
  plannerDone: 2, plannerMissed: 1, plannerPending: 0,
}
```

## 2.3 The date normalisation problem — and the resolution

This is the single most important correctness detail in Phase 1.

| Model | `date` type | Conversion to key |
|---|---|---|
| `Expense`, `DailyJournal`, `QuickNote`, `Budget`, `PlannerGoal` | `String` `'YYYY-MM-DD'` | already a key |
| `HabitLog` | `Date` at UTC midnight | `d.toISOString().split('T')[0]` |
| `WeeklyGoal`, `Transaction`, `SIP`, `Goal` | `Date` (real timestamps) | `toDateKey(d)` — **local** |

**Do not migrate any collection.** Normalise at read time only.

Three rules the implementer must follow exactly:

1. **`HabitLog` uses the UTC path, not `toDateKey`.** `POST /api/compass/habits` stores `new Date(\`${dateStr}T00:00:00.000Z\`)`, and `getAllHeatmapData()` reads it back with `.toISOString().split('T')[0]`. That round-trips correctly. Applying `toDateKey()` (local) to those values in Nepal (UTC+5:45) would shift every habit back one day and silently corrupt every habit-related pattern. Reuse the existing conversion verbatim.

2. **Real timestamps use `toDateKey`.** `Transaction.transactionDate` and `WeeklyGoal.weekStart` are genuine moments in time; those get the local-date treatment from `lib/utils.js`.

3. **Never impute a missing value as zero.** `moodScore: null` means "not recorded". `spendTotalPaisa: 0` means "recorded nothing". Collapsing those two is the most common way to manufacture a fake correlation — a user who logs expenses only on stressful days would appear to spend nothing when calm.

## 2.4 Implementation notes

- Query each collection **once** for the whole window with a `$gte`/`$lte` range, then bucket in memory. Do not query per-day. Existing indexes (`{userId, date}` on Expense, HabitLog, QuickNote, DailyJournal) already cover this exactly.
- Filter `deletedAt: null` on `Expense` and `QuickNote`.
- Category type (`need`/`want`/`savings`) requires joining `Category`; fetch the user's categories once and build a `categoryId → type` map. Reuse `categoryMap()` from `features/budget/utils.js`.
- Word count: reuse the logic already in `app/app/page.jsx` (`content.trim().split(/\s+/).length`) so the Lifeline and the engine agree.
- **Do not cache in Phase 1.** 365 days across five indexed collections is a handful of range scans. Add a cache only if measurement shows it's needed (§9 Phase 2 risk note).

## 2.5 Constants

**File:** `src/features/patterns/constants.js`

```js
export const MOOD_SCORE = { awful: 1, bad: 2, okay: 3, good: 4, amazing: 5 };
export const DEFAULT_WINDOW_DAYS = 90;
export const MAX_WINDOW_DAYS = 365;
export const FDR_Q = 0.10;
export const MIN_EFFECT_R = 0.30;        // |r| floor for correlations
export const MIN_EFFECT_CLIFF = 0.33;    // Cliff's delta floor for group differences
export const MIN_PAIRS_CORRELATION = 21;
export const MIN_GROUP_SIZE = 8;
export const RUN_TTL_HOURS = 20;
export const EVIDENCE_MAX_POINTS = 200;
export const EVIDENCE_MAX_TOP_DAYS = 10;
```

`MOOD_SCORE` must map the exact five keys in `features/journal/components/mood-picker.jsx`. Import `MOODS` from there rather than re-declaring the key list.

---

# 3. Pattern Engine

## 3.1 Statistics library

**File:** `src/features/patterns/stats.js` — pure functions, zero imports, zero DB.

```js
mean(xs) · median(xs) · stdev(xs) · quantile(xs, q)
pearson(xs, ys)            → r
spearman(xs, ys)           → rho          // rank-based; robust to outliers
welchTTest(a, b)           → { t, df, p }
mannWhitneyU(a, b)         → { u, p }     // non-parametric group difference
cliffsDelta(a, b)          → δ ∈ [-1, 1]  // effect size for group difference
fisherCI(r, n)             → [lo, hi]     // 95% CI for a correlation
benjaminiHochberg(pvalues) → qvalues      // multiple-comparison correction
pairwise(rows, xKey, yKey) → { xs, ys, dates }   // drops rows where either is null
lagSeries(rows, k)         → rows'        // shifts one variable k days
```

**Use Spearman, not Pearson, as the default.** Personal-finance data is heavy-tailed — one rent payment or one flight will dominate a Pearson coefficient and produce a "discovery" that is really just a single outlier. Spearman on ranks resists this. Same reasoning drives Mann–Whitney and Cliff's delta over t-tests for group comparisons; keep Welch available for reporting means but let the non-parametric test decide significance.

## 3.2 Detector contract

Every detector — no exceptions — exports this shape:

```js
{
  id: 'mood_want_spend',
  title: 'Mood and discretionary spending',
  domains: ['journal', 'money'],
  family: 'money-mood',
  requires: ['moodScore', 'spendWantPaisa'],
  minSample: 24,
  run(signals, ctx) → PatternResult[] | []
}
```

`run` returns an **array** because some detectors are parameterised — one result per habit name, or per category — and each parameterisation is a separate hypothesis that must be counted in the FDR correction.

## 3.3 PatternResult shape

```js
{
  detectorId: 'habit_mood_next_day',
  params: { habitName: 'Morning Run' },
  statementKey: 'habit_mood_next_day.positive',   // template id, not prose
  statementVars: { habit: 'Morning Run', delta: 0.8, unit: 'mood points' },

  effect: { type: 'group_difference', value: 0.8, unit: 'mood_points', standardised: 0.41 },
  direction: 'positive',
  n: 46,
  pValue: 0.004,
  qValue: null,                    // filled by the engine after FDR
  windowFrom: '2026-05-24',
  windowTo: '2026-08-21',

  evidence: {
    kind: 'two_group',
    groups: {
      a: { label: 'Days after a run', n: 21, mean: 4.1, median: 4 },
      b: { label: 'Days after no run', n: 25, mean: 3.3, median: 3 }
    },
    points: [ { date, x, y } ],     // ≤ EVIDENCE_MAX_POINTS
    topDays: [ { date, note } ],    // ≤ EVIDENCE_MAX_TOP_DAYS
    caveats: ['weekend_confound']
  }
}
```

**Statements are templates, never prose generated at detection time.** The detector emits `statementKey` + `statementVars`; a lookup table in `constants.js` renders the sentence. This keeps language consistent, keeps causal phrasing out by construction, and means the LLM narration in Phase 5 is additive rather than load-bearing.

Template language rule — enforce in review: **associative only.** "On days after you run, your mood averages 0.8 points higher" is permitted. "Running improves your mood" is not.

## 3.4 Engine pipeline

**File:** `src/features/patterns/engine.js`

```js
export async function runPatternEngine(userId, { from, to, detectorIds } = {})
```

1. `getDailySignals(userId, from, to)`
2. **Coverage gate** — for each detector, count days where every field in `requires` is non-null. Skip if below `minSample`; record the skip with the shortfall so §6.7 can render an honest "not yet" state.
3. Run surviving detectors, collecting every `PatternResult`.
4. **Benjamini–Hochberg across the full result set.** Assign `qValue`.
5. **Filter** — keep only results where `qValue < FDR_Q` **and** effect size clears the floor (`MIN_EFFECT_R` / `MIN_EFFECT_CLIFF`) **and** `n >= minSample`.
6. **Confidence banding** (§3.5).
7. **Rank** — `strength × recency × novelty`, where novelty demotes insights the user has already seen or marked "already knew".
8. Return `{ patterns, skipped, coverage, runMeta }`.

### Step 4 is not optional

With ~18 detectors, several parameterised across habits and categories, a single run tests 40–60 hypotheses. At p < 0.05 on pure noise you expect **two or three "discoveries" every run**, and they will read as insightful because the LLM will narrate them fluently. A product whose entire promise is evidence-backed self-knowledge cannot ship without multiple-comparison correction. This is the highest-stakes technical decision in the blueprint.

## 3.5 Confidence

Confidence is **not** the p-value. It's a banding over four inputs, reported to the user in plain language:

| Band | Requires |
|---|---|
| **Low** | `q < 0.10`, `n ≥ minSample`, first detection |
| **Moderate** | `q < 0.05`, `n ≥ 1.5 × minSample`, effect above floor, confirmed in ≥ 2 runs |
| **High** | `q < 0.01`, `n ≥ 2 × minSample`, confirmed in ≥ 4 runs spanning ≥ 3 weeks, effect stable (sign unchanged, magnitude within ±40%) |

**Confidence can only reach High through time.** A pattern that looks strong on day one is still Low until it survives re-testing. This is what makes pattern history a feature rather than a log, and it's the honest answer to small-n instability.

Surface it as: *"Seen consistently over 6 weeks"* — not *"p = 0.008"*.

---

# 4. The initial pattern set

18 detectors across 6 families. Tier 1 (11) ships in Phase 2; Tier 2 (7) follows once coverage supports it.

## 4.0 Shared defaults

To avoid repetition, these apply to **every** detector below unless overridden:

- **Validation:** Spearman for correlations, Mann–Whitney U for group differences; FDR-corrected across the run; effect floor `|ρ| ≥ 0.30` or `|δ| ≥ 0.33`.
- **Confidence:** banded per §3.5.
- **Evidence:** contributing days with dates and values, group means and medians, and links back to the source screen (journal day, expense list filtered to that date).
- **Universal suppression rules — never show a pattern if:**
  - Fewer than `minSample` complete pairs/days
  - The window contains fewer than 14 distinct active days
  - A single day contributes > 40% of the total effect (outlier domination — check by leave-one-out)
  - The user has marked this `detectorId` as "already knew" or dismissed it twice
  - Sign flipped versus the previous run (mark `unstable`, hold back until it settles)

Below, only what differs is stated.

---

## Family A — Money ↔ Mood

### A1. Discretionary spending on low-mood days `mood_want_spend` — **Tier 1**
- **Data:** `moodScore`, `spendWantPaisa`
- **Calculation:** split days into low mood (1–2) vs high mood (4–5); compare want-spend distributions. Cliff's delta for effect.
- **Min sample:** 8 days per group, 24 total with mood
- **Don't show if:** the user logs expenses on fewer than 60% of mood-recorded days (selective logging makes this meaningless)

### A2. Mood today → spending tomorrow `mood_next_day_spend` — **Tier 1**
- **Data:** `moodScore` (day *d*), `spendTotalPaisa` (day *d+1*)
- **Calculation:** lag-1 Spearman
- **Min sample:** 21 consecutive-day pairs
- **Why it matters:** the lag is what makes it a *discovery* rather than a restatement. Same-day mood and same-day spending are entangled; yesterday predicting today is a genuine finding.
- **Don't show if:** the pair gap rate exceeds 30% (too many missing days to call it consecutive)

### A3. Spending today → mood tomorrow `spend_then_mood` — **Tier 1**
- **Data:** `spendWantPaisa` (day *d*), `moodScore` (day *d+1*)
- **Calculation:** lag-1 Spearman; also compare mood after top-quintile want-spend days vs the rest
- **Min sample:** 21 pairs
- **Note:** this is the "purchase regret" direction. If A2 and A3 both fire, present them as one two-sided insight, not two — a feedback loop is more interesting and more honest than two half-findings.

### A4. Mood around unusually large purchases `large_purchase_mood` — **Tier 2**
- **Data:** `largestExpensePaisa`, `moodScore` for *d−1*, *d*, *d+1*
- **Calculation:** define "large" as > the user's own P90 single-expense; compare the three-day mood profile against baseline
- **Min sample:** 10 large-purchase events with mood on at least two of the three days
- **Don't show if:** fewer than 10 events, or if large purchases are dominated by one recurring category (rent) — exclude `isRecurring: true` and `autoGenerated: true` expenses

---

## Family B — Money ↔ Habits

### B1. Spending on days a habit was kept `habit_day_spend` — **Tier 1, parameterised per habit**
- **Data:** `habitByName[h]`, `spendTotalPaisa`
- **Calculation:** per habit, compare spend on kept vs missed days
- **Min sample:** 12 kept and 12 missed days for that specific habit
- **Don't show if:** the habit was kept on > 85% or < 15% of days (no contrast to measure); cap output at the 3 strongest habits to protect the FDR budget and the feed

### B2. Streak state and discretionary spending `streak_want_spend` — **Tier 2**
- **Data:** `habitRate` history, `spendWantPaisa`
- **Calculation:** classify each day as "in streak" (≥ 3 consecutive days with `habitRate ≥ 0.5`) or "broken"; compare want-spend
- **Min sample:** 10 days per state

### B3. Category-level habit coupling `habit_category_spend` — **Tier 2, parameterised**
- **Data:** `habitByName[h]`, `spendByCategoryId[c]`
- **Calculation:** as B1 but per category
- **Min sample:** the category must have non-zero spend on ≥ 15 days
- **Don't show if:** more than 2 fire — keep only the strongest, or the feed becomes a spreadsheet

---

## Family C — Habits ↔ Mood

### C1. Same-day habit completion and mood `habit_rate_mood` — **Tier 1**
- **Data:** `habitRate`, `moodScore`
- **Calculation:** Spearman across all days where both exist
- **Min sample:** 24 pairs
- **Caveat to attach:** bidirectional — feeling good makes habits easier and vice versa. The template must say "move together", not "leads to".

### C2. Habit today → mood tomorrow `habit_mood_next_day` — **Tier 1, parameterised per habit**
- **Data:** `habitByName[h]` (day *d*), `moodScore` (day *d+1*)
- **Calculation:** compare next-day mood after kept vs missed
- **Min sample:** 12 per group
- **Why it matters:** this is the most actionable shape in the whole set — it points forward. Prioritise it in ranking.

### C3. Consecutive missed days and mood `habit_lapse_mood` — **Tier 2**
- **Data:** `habitRate` run-lengths, `moodScore`
- **Calculation:** mood on days ending a run of ≥ 3 zero-habit days vs baseline
- **Min sample:** 8 such runs

---

## Family D — Journal ↔ everything

### D1. Journaling days and spending `journal_day_spend` — **Tier 1**
- **Data:** `hasJournal`, `spendTotalPaisa`
- **Min sample:** 12 per group
- **Don't show if:** journaling rate > 90% or < 10%

### D2. Entry length and mood `journal_length_mood` — **Tier 1**
- **Data:** `journalWords`, `moodScore`
- **Calculation:** Spearman; report direction carefully — long entries can mean either processing or rumination
- **Min sample:** 24 pairs
- **Don't show if:** median word count < 20 (the signal is noise at that length)

### D3. Gratitude notes and mood `gratitude_mood` — **Tier 1**
- **Data:** `noteCountByType.gratitude`, `moodScore`
- **Calculation:** compare mood on days with ≥ 1 gratitude note vs none; also test lag-1
- **Min sample:** 10 gratitude days
- **Caveat:** strongly bidirectional. Template must reflect that.

### D4. Journal silence and mood `journal_silence_mood` — **Tier 2**
- **Data:** `hasJournal` run-lengths, `moodScore`
- **Calculation:** mood on the first day of writing after a gap of ≥ 3 days, versus overall
- **Min sample:** 8 gaps
- **Handle with care:** this can read as accusatory ("you avoid writing when low"). Template must be gentle and non-judgemental, and this one should never be the headline card.

### D5. Note volume and spending `note_volume_spend` — **Tier 2**
- **Data:** `noteCount`, `spendTotalPaisa`
- **Min sample:** 24 pairs

---

## Family E — Rhythm

### E1. Day-of-week discretionary spending `dow_want_spend` — **Tier 1**
- **Data:** `dow`, `spendWantPaisa`
- **Calculation:** Kruskal–Wallis across 7 groups; if significant, report the single highest day vs the rest
- **Min sample:** 8 weeks (≥ 4 observations per weekday)
- **Don't show if:** the effect is driven entirely by recurring/auto-generated expenses that always fall on the same weekday — exclude them first

### E2. Weekend vs weekday mood `weekend_mood` — **Tier 1**
- **Data:** `isWeekend`, `moodScore`
- **Min sample:** 10 weekend days and 10 weekday days
- **Note:** this is the most likely detector to fire early and the least surprising. Rank it low — it's a good confidence-builder in a sparse feed but it should never outrank a lagged finding.

### E3. Month-phase spending `month_phase_spend` — **Tier 2**
- **Data:** `dayOfMonth`, `spendTotalPaisa`
- **Calculation:** days 1–7 vs 8–31
- **Min sample:** 2 full months
- **Important honesty constraint:** there is **no income model in the schema**, so this is a *proxy* for payday, not payday itself. The template must say "early in the month", never "after payday". Once income capture exists (§7.5), replace this detector rather than reinterpreting it.

---

## Family F — Budget ↔ behaviour

### F1. Budget pressure and mood `budget_pressure_mood` — **Tier 1**
- **Data:** `spendTotalPaisa` cumulative vs `computeBudgetSummary` limits, `moodScore`
- **Calculation:** classify each day by whether month-to-date spend had already crossed `BUDGET_WARNING_RATIO` (0.8) of the total budget; compare mood
- **Min sample:** 2 months with a total budget set, 10 days per group
- **Reuse:** `computeBudgetSummary` from `features/budget/summary.js` — do not reimplement the carry-forward logic
- **Don't show if:** no total-scope budget exists for the period

### F2. Context around savings contributions `savings_context` — **Tier 2**
- **Data:** `FinancialGoal.contributions[].date`, `habitRate`, `moodScore` for the preceding 3 days
- **Min sample:** 10 contribution events
- **Don't show if:** contributions are near-perfectly regular (monthly standing transfer) — regularity means there's nothing behavioural to find

---

## 4.1 What is deliberately absent

- **Nothing using `Transaction`, `SIP`, or `StockPrice`.** NEPSE prices move on market forces, not on the user's sleep. Correlating them would produce spurious findings with an air of authority. Portfolio data stays out of the engine entirely. *(DEPRIORITIZE — data and screens retained.)*
- **Nothing using `Goal.subScores`.** Single-use IELTS scaffolding, no cross-domain value.
- **Three-way interactions** (sleep + stress + spending). Not until two-way patterns are stable and coverage is proven. Interaction effects need far more data than this app will have in year one.

---

# 5. Persistence

## 5.1 `src/models/Insight.js`

```js
{
  userId: ObjectId(ref User, indexed, required),
  detectorId: String(required),
  params: Mixed,                    // { habitName: 'Morning Run' }
  fingerprint: String(required),    // detectorId + stable-sorted params, hashed

  statementKey: String,
  statementVars: Mixed,
  title: String,
  domains: [String],

  effect: { type, value, unit, standardised },
  direction: String,                // 'positive' | 'negative'
  n: Number,
  pValue: Number,
  qValue: Number,
  confidence: String,               // 'low' | 'moderate' | 'high'

  evidence: Mixed,                  // capped per constants
  windowFrom: String, windowTo: String,

  narration: { text, model, generatedAt },

  status: String,                   // 'active' | 'stale' | 'dismissed' | 'archived'
  firstDetectedAt: Date,
  lastConfirmedAt: Date,
  timesConfirmed: Number,
  strengthHistory: [{ date, value, n, qValue, confidence }],

  feedback: { rating, note, at },   // 'useful' | 'not_useful' | 'knew_it'
  readAt: Date,
}
```

**Indexes:**
```js
{ userId: 1, fingerprint: 1 }  // unique
{ userId: 1, status: 1, lastConfirmedAt: -1 }
{ userId: 1, confidence: 1 }
```

## 5.2 Fingerprinting — where pattern history comes from

**File:** `src/features/patterns/fingerprint.js`

```js
fingerprint(detectorId, params) → sha1(detectorId + '|' + stableStringify(params))
```

On each run, **upsert by `{ userId, fingerprint }`**:

- **New fingerprint** → insert, `firstDetectedAt = now`, `timesConfirmed = 1`, `confidence = 'low'`
- **Existing, still significant** → push to `strengthHistory`, increment `timesConfirmed`, update `lastConfirmedAt`, recompute confidence band
- **Existing, no longer significant** → `status = 'stale'`, keep the document and its history

This single decision gives pattern history, confidence-through-time, re-testing, and the "did this hold?" weekly check-in — all for free, with no extra machinery. It is the highest-leverage detail in the persistence layer.

**Never delete an Insight.** Dismissal is a status change. History is the product.

## 5.3 `src/models/PatternRun.js`

```js
{ userId, runAt, windowFrom, windowTo, detectorsRun, detectorsSkipped,
  patternsFound, patternsNew, durationMs, error }
```

Used for the TTL gate (§5.5), cost control, and debugging why a pattern did or didn't fire.

## 5.4 Additive fields on `DailyJournal`

For Phase 7 journal extraction. **Additive and optional — no migration, old documents simply lack them.** This mirrors how `title` and `aiSummary` were already added to the legacy `journalentries` collection.

```js
signals: {
  sentiment: Number,        // -1..1
  energy: String,           // 'low' | 'medium' | 'high'
  themes: [String],
  stressors: [String],
  extractedAt: Date,
  model: String,
}
```

## 5.5 Run gating

Running the engine on every page load is wasteful and, once narration is attached, expensive. Gate it:

- On Discoveries load, check the latest `PatternRun`. If it's within `RUN_TTL_HOURS` (20), serve stored insights.
- Otherwise trigger a run.
- Always allow a manual "Check for new patterns" action, rate-limited to a few per day.

**Recommended over cron.** Vercel's Hobby tier permits limited daily cron invocations and you already spend one on `scrape-nepse`. Lazy-with-TTL needs no additional cron slot, and for a personal app it produces the same result. Add the Phase 6 cron only if you want the weekly digest to land without the user opening the app.

---

# 6. Discoveries — the primary experience

## 6.1 Navigation changes

**MODIFY `src/components/sidebar.jsx`:**
```js
const NAV = [
  { href: '/app',            label: 'Discoveries',    icon: Sparkles },
  { href: '/app/today',      label: 'Today',          icon: LayoutDashboard },
  { href: '/app/journal',    label: 'Journal',        icon: BookOpen },
  { href: '/app/budget',     label: 'Money',          icon: Receipt, children: [...unchanged] },
  { href: '/app/goals',      label: 'Habits & Goals', icon: Target },
  { href: '/app/weekly',     label: 'Weekly',         icon: CalendarCheck },
  { href: '/app/planner',    label: 'Planner',        icon: CalendarDays },
  { href: '/app/portfolio',  label: 'Portfolio',      icon: TrendingUp },
];
```
Also **remove the `"Modules"` section label** — that word is the super-app framing rendered directly into the nav.

**MODIFY `src/components/bottom-nav.jsx`:**
```js
const TABS = [
  { href: '/app',         label: 'Discover', icon: Sparkles },
  { href: '/app/budget',  label: 'Money',    icon: Receipt },
  { href: '/app/journal', label: 'Journal',  icon: BookOpen },
  // + More
];
const MORE_LINKS = [
  { href: '/app/today', ... }, { href: '/app/goals', ... },
  { href: '/app/planner', ... }, { href: '/app/weekly', ... },
  { href: '/app/portfolio', ... },
];
```

Note the current bottom nav already buries `/app` ("Today") inside the More sheet — you had effectively demoted the dashboard already. This makes it deliberate.

**Route move — MODIFY, not rewrite:**
- Move `src/app/app/page.jsx` → `src/app/app/today/page.jsx` **unchanged**. It's good work; it just isn't the front door.
- New `src/app/app/page.jsx` renders `DiscoveriesScreen`.
- **Update these three links** (verified by grep): `components/mobile-topbar.jsx:32` (`aria-label="Today — home"` — change target to `/app/today` or relabel), and `features/landing/components/landing-hero.jsx:24,60` (these stay `/app`, which is now Discoveries — correct, but re-read the surrounding copy).

## 6.2 Discoveries home layout

```
┌────────────────────────────────────────┐
│ Good evening, Sujan          Thu, 21 Aug│
├────────────────────────────────────────┤
│ [Lifeline sparkline]        ← KEEP AS-IS│
├────────────────────────────────────────┤
│ ✦ HEADLINE DISCOVERY                    │
│ Your discretionary spending runs 62%    │
│ higher on days after a low-mood day.    │
│ ●●● Seen consistently over 6 weeks      │
│ Based on 46 days · [See the evidence →] │
├────────────────────────────────────────┤
│ Also noticed                            │
│ ┌────────────────────────────────────┐ │
│ │ [insight card]                     │ │
│ │ [insight card]                     │ │
│ │ [insight card]                     │ │
│ └────────────────────────────────────┘ │
├────────────────────────────────────────┤
│ Still learning                          │
│ Sleep ↔ spending — 9 more days of mood │
│ ▓▓▓▓▓▓▓░░░ 21/30 days                  │
├────────────────────────────────────────┤
│ Quick log:  [Mood] [Expense] [Habit]   │
└────────────────────────────────────────┘
```

Design notes:

- **Keep the Lifeline exactly as it is.** It's the one existing element that composites domains, and it earns its place at the top of the new home.
- **The headline slot takes the top-ranked unread insight.** One at a time. A wall of nine discoveries is dashboard fatigue wearing a new hat.
- **"Still learning" is a feature, not an apology.** It converts the cold-start problem into visible progress and tells the user exactly which capture behaviour unlocks which discovery.
- **Quick-log row reuses existing dialogs** — `expense-dialog.jsx`, `MoodPicker`, the habit toggle from `compass-client.jsx`. No new capture UI.

## 6.3 Insight card structure

```
┌─────────────────────────────────────────┐
│ 💰 Money  ×  🧠 Mood            [·· ]  │   domain chips + overflow menu
│                                         │
│ You spend about 62% more on wants on    │   statement — one sentence,
│ days following a low-mood day.          │   template-rendered, associative
│                                         │
│ ▁▂▅▇▅▂▁  ← mini evidence viz            │
│                                         │
│ ●●○ Moderate · 46 days · last 3 months  │   confidence · n · window
└─────────────────────────────────────────┘
```

- Statement is **always** the deterministic template. LLM narration appears on the detail page, never on the card — so the feed still works if Groq is down or rate-limited.
- Overflow menu: *Useful · Not useful · I already knew this · Hide*.
- Confidence as filled dots plus a word. Never a p-value on a card.

## 6.4 Pattern detail page

`src/app/app/discoveries/[id]/page.jsx`

1. **Statement** — the template sentence, large.
2. **What this means** — LLM narration (2–3 sentences), clearly styled as interpretation, with a regenerate control.
3. **The evidence** — the chart. Two-group patterns get paired distributions; correlations get a scatter with a rank-fit line; lagged patterns get an aligned dual timeline.
4. **The days behind it** — an actual table of contributing dates with values, each row linking to that day's journal or a date-filtered expense list. *This is what separates the product from a chatbot that guesses.* Cap at `EVIDENCE_MAX_TOP_DAYS` with "show all".
5. **How confident we are** — plain language: *"Tested across 46 days with both values recorded. Confirmed in 4 of the last 5 checks. The relationship has held since 12 July."*
6. **What this doesn't tell you** — always present, never collapsed. Confounds detected (weekend overlap, recurring expenses), and the standing caveat that these are associations, not causes.
7. **How it's changed** — `strengthHistory` as a line chart.
8. **Feedback row.**

## 6.5 Evidence presentation

Reuse `recharts` — already a dependency (`features/vault/components/vault-client.jsx`).

| Evidence kind | Chart |
|---|---|
| `two_group` | Paired dot/box plot, group means marked |
| `correlation` | Scatter + monotonic fit, outliers visually flagged not hidden |
| `lagged` | Two aligned time series, offset annotated |
| `categorical` | Small-multiple bars (day-of-week) |

**Show the outliers.** Hiding them to make a chart look clean is the visual equivalent of the statistical dishonesty §3.4 exists to prevent.

## 6.6 Confidence presentation

| Internal | User-facing | Dots |
|---|---|---|
| `low` | "Early signal — worth watching" | ●○○ |
| `moderate` | "Seen consistently over N weeks" | ●●○ |
| `high` | "Strong, stable pattern" | ●●● |

Never surface p-values, q-values, or effect sizes as raw numbers in the primary UI. A "details" disclosure on the detail page may show them for the curious.

## 6.7 States

**Empty (new user, no data)**
> "Nothing to discover yet — that's expected. Patterns need about three weeks of data. Log your mood today and we'll start looking."
Plus the readiness checklist. No fake sample insights.

**Insufficient data (has data, nothing testable)**
Show the readiness panel from `GET /api/patterns/readiness`: per-domain coverage bars with the specific gap. *"Mood recorded on 11 of the last 30 days. Most patterns need 24."*

**Tested, nothing found**
> "We tested 34 possible relationships across your money, habits and journal this week. None of them held up statistically. That's a real result — it means your spending isn't being pushed around by the things we can currently see."

This state matters enormously. A product that always finds something is a product that is lying. Say so plainly and the honest states become a trust signal rather than a failure.

**Computing**
Skeleton cards via the existing `components/ui/skeleton.jsx`. Copy: *"Testing relationships across 90 days…"*

**Stale insight**
Visible in history with a marker: *"This pattern no longer holds — last confirmed 3 weeks ago."* Not deleted.

## 6.8 Historical discoveries

`src/app/app/discoveries/page.jsx` — the archive. Filter by domain, confidence, status. Sort by first detected / last confirmed / strength. Includes stale and dismissed. This is where a user goes to ask *"what has this app actually taught me?"* — the strongest retention surface in the product.

---

# 7. AI architecture

## 7.1 Hard boundary

The LLM may **only** receive pre-computed numbers and may **only** produce prose. Four roles, all constrained.

## 7.2 Numeric guardrail

**File:** `src/features/patterns/narrate.js`

```js
/**
 * Rejects narration containing any number not present in the input payload.
 * Tolerates rounding (62.4 → "62%"). On failure: retry once, then fall back
 * to the deterministic template sentence.
 */
export function assertNoInventedNumbers(output, allowedValues) → boolean
```

Extract every numeric token from the output, compare against a whitelist derived from the `PatternResult`, permit ±1 rounding drift and spelled-out small integers. Cheap to implement, and it makes "the AI made up a statistic" structurally impossible rather than merely discouraged.

## 7.3 Role 1 — Pattern narration

`POST /api/patterns/insights/[id]/narrate`

**Input:** the `PatternResult` as JSON. No raw journal text, no raw expense rows.

```
You explain a statistical finding about one person's own life data.

FINDING (already computed — do not recalculate anything):
{{patternJson}}

Write 2-3 sentences that:
- State what was found, in plain language
- Use ONLY numbers present in the finding above
- Describe association, never causation. Use "tends to", "on days when",
  "moves alongside". Never "causes", "makes", "leads to", "because of"
- Are neutral and non-judgemental. This is the user's own life; do not
  moralise about spending, mood, or missed habits
- Do not give advice unless the finding is a forward-looking one
- Do not open with "Interestingly" or "It appears that"

Output plain prose. No headings, no bullets, no preamble.
```

## 7.4 Role 2 — Pattern explanation ("why might this be?")

On-demand, detail page only.

```
A statistical association was found in one person's data:
{{statement}} (n={{n}}, confidence: {{confidence}})

Offer 2-3 plausible everyday explanations for why two things like this
might move together. Rules:
- Present these explicitly as possibilities, not conclusions
- Include at least one explanation where the causation runs the OTHER way
- Include the possibility that a third factor explains both
- Never assert which is correct
- No advice, no numbers, under 120 words
```

Requiring a reverse-causation candidate every time is a deliberate epistemics guard — it prevents the explanation feature from quietly becoming a causation-assertion feature.

## 7.5 Role 3 — Weekly reflection

`POST /api/ai/weekly` — see §8.

**Input:** validated patterns for the week + a **pre-computed** week summary (totals, rates, deltas — all from `signals.js`) + last week's patterns with hold/fail status.

```
Write a short weekly reflection for someone reviewing their own week.

NEW PATTERNS (validated, do not recalculate): {{newPatterns}}
PATTERN CHECK-INS (held or faded): {{checkIns}}
WEEK SUMMARY (pre-computed): {{weekSummary}}

Structure:
1. One sentence naming the shape of the week
2. The most interesting new discovery, in plain language
3. Whether last week's patterns held
4. One genuine question worth sitting with — not advice

Rules: use only the numbers provided; association not causation; warm but
not saccharine; never scold; under 220 words.
```

## 7.6 Role 4 — Journal signal extraction

`POST /api/journal/extract` — the one that turns prose into a correlatable variable.

```
Extract structured signals from one journal entry. Return ONLY valid JSON,
no markdown fences, no commentary.

ENTRY: {{content}}

{
  "sentiment": <float -1.0 to 1.0>,
  "energy": "low" | "medium" | "high",
  "themes": [<up to 4 lowercase single words or short phrases>],
  "stressors": [<up to 3, or empty>]
}

Judge only what is written. Do not infer beyond the text. If the entry is
too short or ambiguous, return sentiment 0 and empty arrays.
```

- Parse defensively: strip fences, `JSON.parse` in try/catch, validate ranges, discard on failure. The existing `review-client.jsx` markdown renderer already shows this codebase expects imperfect LLM output — apply the same scepticism.
- Store in `DailyJournal.signals` (§5.4).
- Trigger on journal save (debounced) and via an opt-in backfill job.
- **Once this ships, `sentiment` becomes a first-class signal** and enables text-derived detectors that don't depend on the user remembering to set a mood — the highest-value follow-on in the whole plan, because mood coverage is the binding constraint (§10 risk 2).

## 7.7 Fate of the existing briefing

`app/api/ai/briefing/route.js` — **MODIFY, don't delete.**

Its data-aggregation helpers (`summarizeHabits`, `summarizeTransactions`, `summarizeJournal`) contain real work. Keep the file and the route so nothing breaks mid-migration, but:
- Retarget it as the Phase 6 weekly digest, or
- Deprecate it once `/api/ai/weekly` is live, leaving the route returning a redirect notice for one release.

Also — and this is the cheapest high-value fix in the entire blueprint — **it currently imports `Transaction` but not `Expense`.** Whatever else happens to this route, fix that in Phase 1.

## 7.8 Privacy

Journal text already goes to Groq via the existing briefing and reflect endpoints, so this isn't new — but extraction makes it systematic and continuous. The landing page has a `#privacy` section (`features/landing/components/landing-privacy.jsx`); it must state plainly what leaves the device and when. Add a per-user toggle for journal extraction. Some people will want the pattern engine but not text analysis, and that's a reasonable position to support.

---

# 8. Weekly Discoveries

**MODIFY** `app/app/review/` → `app/app/weekly/`. Keep the route file; change what it renders.

## 8.1 What changes

| Current | Becomes | Mark |
|---|---|---|
| `PlannerReviewSummary` | Unchanged | **KEEP** |
| "AI Executive Summary" button | Auto-generated weekly digest | **MODIFY** |
| Per-goal star rating (1–5) | Removed from UI; `WeeklyGoal.evaluation.rating` retained in schema | **DEPRIORITIZE** |
| Per-goal reflection textarea | Kept — one free-text box for the week, not per goal | **MODIFY** |
| Goal checklist review | Collapsed into a compact summary | **MODIFY** |
| — | New discoveries this week | **ADD** |
| — | Pattern check-ins: did last week's hold? | **ADD** |
| — | One question to sit with | **ADD** |

## 8.2 Layout

```
Weekly Discoveries — 17–23 Aug

① Your week           one line, pre-computed
② What we learned     new insights, headline first
③ What held           last week's patterns: held / faded / strengthened
④ Worth sitting with  one question, LLM-generated
⑤ Your reflection     free text → WeeklyGoal.evaluation.reflection (reused)
⑥ Planner summary     existing component, unchanged
```

Section ③ is the emotional core of the whole product. *"Three weeks ago we noticed you spend more after low-mood days. It held again this week."* That's a relationship with the user's own history — something no budgeting app or habit tracker can offer, and something only the fingerprint design in §5.2 makes possible.

## 8.3 Trigger

Lazy on visit (TTL-gated per §5.5). Optional cron in Phase 6: `app/api/cron/weekly-patterns/route.js`, Sundays 18:00 NPT, reusing the `CRON_SECRET` bearer check from `app/api/cron/scrape-nepse/route.js` verbatim. **Verify Vercel plan cron limits first** — one slot is already taken.

---

# 9. Phased roadmap

---

## Phase 1 — Foundation

**Goal:** One reliable normalised daily view of every domain. No user-visible change except one bug fix.

**Changes**
- ADD `features/patterns/constants.js`
- ADD `features/patterns/signals.js` → `getDailySignals(userId, from, to)`
- ADD `features/patterns/stats.js` (pure functions only)
- ADD `app/api/patterns/readiness/route.js` → per-domain coverage over the last 30/90 days
- MODIFY `app/api/ai/briefing/route.js` — **import and include `Expense`** in the aggregation and prompt
- ADD dev dependency `vitest` + config

**Files/models/APIs:** reads `Expense`, `Category`, `DailyJournal`, `QuickNote`, `HabitLog`, `PlannerGoal`. Reuses `lib/mongoose.js`, `lib/utils.js` (`toDateKey`), `lib/week.js`, `lib/money.js`, `features/budget/utils.js` (`categoryMap`).

**Database:** none.

**Dependencies:** none blocking.

**Testing**
- Unit: every function in `stats.js` against known-answer fixtures (verify `pearson`, `spearman`, `mannWhitneyU` against hand-computed values).
- **Date-boundary test — mandatory.** Build a fixture with a `HabitLog` at `2026-08-14T00:00:00.000Z` and an `Expense` at `'2026-08-14'`; assert both land on the same `DailySignal`. Run the suite under `TZ=Asia/Kathmandu`. This is the bug that would silently poison every habit pattern.
- Assert missing values are `null`, never `0`.
- Assert soft-deleted expenses and notes are excluded.

**Definition of done:** `getDailySignals` returns a complete, gap-explicit series for any window up to 365 days; all stats functions pass known-answer tests; the timezone test passes; the briefing now sees expenses.

---

## Phase 2 — Pattern Engine

**Goal:** Deterministic detection of the Tier 1 pattern set with correct multiple-comparison handling.

**Changes**
- ADD `features/patterns/detectors/` — 11 Tier 1 detectors across the 6 families
- ADD `features/patterns/detectors/index.js` registry
- ADD `features/patterns/engine.js` → `runPatternEngine()`
- ADD statement templates to `constants.js`
- ADD `benjaminiHochberg`, `cliffsDelta`, `fisherCI` to `stats.js`

**Database:** none yet — engine returns in-memory results.

**Dependencies:** Phase 1.

**Testing** — this phase carries the project's real risk, so testing is heavier than elsewhere:
- **Planted-pattern test:** generate synthetic signals with a known relationship injected; assert the right detector fires with roughly the right effect size.
- **Null test (the most important test in the project):** generate 200 days of pure random signals, run the full engine 100 times, assert the FDR-corrected false-discovery rate stays under 10%. Without correction this will fail loudly — which is the point.
- **Outlier-domination test:** one enormous expense must not by itself produce a pattern (leave-one-out check fires).
- **Sparse-data test:** below `minSample`, detectors skip and report the shortfall rather than returning weak results.
- Statement templates render with correct pluralisation and never contain causal verbs (assert against a banned-word list).

**Definition of done:** 11 detectors implemented and tested; FDR correction applied across the full result set; null test passes; a manual run against real data produces results that are inspectable and defensible.

---

## Phase 3 — Persistence

**Goal:** Insights become durable objects with identity and history.

**Changes**
- ADD `models/Insight.js`, `models/PatternRun.js`
- ADD `features/patterns/fingerprint.js`
- MODIFY `engine.js` — upsert-by-fingerprint, `strengthHistory` append, confidence banding, stale marking
- ADD `app/api/patterns/run/route.js` (TTL-gated)
- ADD `app/api/patterns/insights/route.js`, `.../[id]/route.js`

**Database:** two new collections. Indexes per §5.1. No changes to existing collections.

**Migration:** none. First run populates from scratch.

**Dependencies:** Phase 2.

**Testing**
- Re-running the engine on unchanged data updates rather than duplicating (unique fingerprint index holds).
- Parameterised detectors produce distinct fingerprints per parameter.
- A pattern that stops being significant → `status: 'stale'`, document and history retained.
- Confidence cannot jump to `high` on first detection regardless of p-value.
- TTL gate prevents a second run inside the window.

**Definition of done:** running twice produces stable insight identity; `strengthHistory` accumulates; nothing is ever hard-deleted.

---

## Phase 4 — Discoveries UI

**Goal:** Discoveries becomes home.

**Changes**
- MOVE `app/app/page.jsx` → `app/app/today/page.jsx` (unchanged content)
- ADD new `app/app/page.jsx` → `DiscoveriesScreen`
- ADD `app/app/discoveries/page.jsx` (history) and `app/app/discoveries/[id]/page.jsx` (detail)
- ADD `features/patterns/components/`: `discoveries-screen.jsx`, `insight-card.jsx`, `insight-detail.jsx`, `evidence-chart.jsx`, `confidence-pill.jsx`, `data-readiness.jsx`
- ADD `features/patterns/store.js` (Zustand, mirroring `features/journal/store.js`)
- ADD `features/patterns/actions.js`
- MODIFY `components/sidebar.jsx` (NAV, drop "Modules" label)
- MODIFY `components/bottom-nav.jsx` (TABS, MORE_LINKS)
- MODIFY `components/mobile-topbar.jsx` (line 32 link target/label)
- REUSE: `Lifeline` from `components/brand-mark.jsx`, `components/ui/*`, `components/empty-state.jsx`, `components/ui/skeleton.jsx`, `recharts`

**Dependencies:** Phase 3.

**Testing**
- All five states render correctly: empty, insufficient, computing, results, nothing-found.
- Cards render from stored insights with **no LLM call** (narration is Phase 5 — the feed must work without it).
- Evidence tables link correctly to source days.
- Mobile: bottom nav reachable, no layout shift, PWA install still works.
- No regression on `/app/today` — it should render exactly as `/app` does today.

**Definition of done:** `/app` is Discoveries; the old dashboard lives intact at `/app/today`; every state is designed and reachable; nothing calls Groq yet.

---

## Phase 5 — AI narration

**Goal:** Validated patterns get human language. The LLM performs zero arithmetic.

**Changes**
- ADD `features/patterns/narrate.js` (+ `assertNoInventedNumbers`)
- ADD `app/api/patterns/insights/[id]/narrate/route.js`
- MODIFY `insight-detail.jsx` — narration block + regenerate
- ADD the explanation role (§7.4)
- REUSE `lib/groq.js` (`getGroqClient`, `GROQ_CHAT_MODEL`) unchanged

**Dependencies:** Phase 4.

**Testing**
- Feed a `PatternResult`; assert output contains no number absent from the input.
- Assert banned causal verbs never appear (adversarial prompts included).
- Groq failure → card and detail still render with the template statement. **Narration is strictly additive; nothing breaks without it.**
- Narration persists to `Insight.narration` and is not regenerated on every view (cost control).

**Definition of done:** every insight can be narrated; the guardrail provably blocks invented numbers; the product degrades gracefully to templates when the LLM is unavailable.

---

## Phase 6 — Weekly reflection

**Goal:** The weekly ritual.

**Changes**
- MODIFY `app/app/review/` → `app/app/weekly/` (redirect the old path for one release)
- MODIFY `features/review/components/review-client.jsx` → weekly discoveries layout
- KEEP `PlannerReviewSummary` unchanged
- ADD `app/api/ai/weekly/route.js`
- MODIFY or deprecate `app/api/ai/briefing/route.js` (§7.7)
- ADD `app/api/cron/weekly-patterns/route.js` — **optional**, only if plan cron limits allow
- KEEP `WeeklyGoal.evaluation.reflection` as the storage target for the free-text box

**Dependencies:** Phase 5.

**Testing**
- Week with new patterns, week with none, week with a faded pattern — all render sensibly.
- Check-in logic correctly classifies held / faded / strengthened against `strengthHistory`.
- Cron (if added) rejects unauthenticated calls exactly as `scrape-nepse` does.
- Old `/app/review` URL still resolves.

**Definition of done:** the weekly page tells the user what was learned and whether prior patterns held; star-rating UI is gone but its data field is intact.

---

## Phase 7 — Feedback and personalisation

**Goal:** The system learns what the user actually finds valuable — and starts answering the founding question directly.

**Changes**
- ADD `app/api/patterns/insights/[id]/feedback/route.js`
- MODIFY `insight-card.jsx` / `insight-detail.jsx` — feedback affordances
- MODIFY `engine.js` — ranking incorporates feedback; suppress detectors marked "already knew" twice
- ADD journal signal extraction: `app/api/journal/extract/route.js`, `DailyJournal.signals` (§5.4), backfill script
- ADD sentiment-based detectors (variants of C1, D2, A1 using `signals.sentiment` instead of `moodScore`)
- ADD privacy toggle for extraction

**Database:** additive optional subdocument on `DailyJournal`. No migration; legacy documents simply lack the field, exactly as with `title` and `aiSummary`.

**Dependencies:** Phase 6.

**Testing**
- "Already knew this" suppresses that `detectorId` in subsequent runs.
- Extraction handles malformed LLM JSON without corrupting the journal document.
- Backfill is idempotent, rate-limited, and resumable.
- Sentiment-derived detectors respect the same coverage gates.
- Opting out of extraction stops all journal text leaving the app.

**Definition of done:** feedback changes what surfaces; extraction produces usable structured signals; sentiment works as a fallback signal where mood is unrecorded.

---

# 10. Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | **False discoveries from multiple testing.** 40–60 hypotheses per run guarantees spurious findings that the LLM will narrate persuasively. | **Critical** | BH-FDR at q < 0.10, effect-size floors, minimum sample sizes, confirmation-across-runs before High confidence, and the Phase 2 null test as a permanent regression guard. |
| 2 | **Sparse mood data starves the engine.** Mood is optional and nullable; most Family A and C detectors need ~24 mood-days. | **High** | Reduce capture friction first (quick-log on Discoveries home); coverage gating with honest "still learning" states; Phase 7 sentiment extraction as an independent fallback signal. |
| 3 | **Users read correlation as causation** and change real financial behaviour on a spurious finding. | **High** | Template language enforced at the detector layer; banned-verb test; mandatory "what this doesn't tell you" block; reverse-causation requirement in the explanation prompt. |
| 4 | **Small-n instability** — patterns appear and vanish week to week, destroying trust. | **High** | Confidence can only rise through repeated confirmation; sign-flip detection holds unstable patterns back; `strengthHistory` shown openly. |
| 5 | **Timezone corruption of the join.** UTC+5:45 plus mixed `Date`/string storage. | **High** | Per-model conversion rules fixed in §2.3; mandatory timezone test in Phase 1; never touch `toDateKey`. |
| 6 | **LLM invents statistics.** | Medium | `assertNoInventedNumbers` whitelist check, retry, then deterministic template fallback. |
| 7 | **Serverless timeout / cost.** 365-day multi-collection scan plus narration inside one request. | Medium | TTL-gated runs; narration on demand and persisted; single range query per collection; add a materialised signal cache only if measurement demands it. |
| 8 | **Vercel cron limits.** One slot already used by `scrape-nepse`. | Low | Lazy-with-TTL as the primary mechanism; cron strictly optional. |
| 9 | **Privacy expansion.** Continuous journal text to a third-party LLM. | Medium | Explicit disclosure in the existing privacy section; per-user opt-out; extraction sends one entry at a time, never the corpus. |
| 10 | **Evidence documents bloat.** `Mixed` fields grow unbounded. | Low | Hard caps in `constants.js`; store day references, not full expense rows. |
| 11 | **Feed fatigue.** Parameterised detectors emit one result per habit and per category. | Medium | Cap at 3 per family; headline-plus-few layout; novelty demotion in ranking. |
| 12 | **The engine finds nothing for weeks.** Realistic for a single user with modest data. | Medium | Design the nothing-found state as a trust signal (§6.7). A product that always finds something is lying. |

---

# 11. Change register

| Area | Item | Mark |
|---|---|---|
| Data | `Expense`, `Category`, `Budget`, `Debt`, `FinancialGoal` | **KEEP** |
| Data | `DailyJournal`, `QuickNote`, `HabitLog` | **KEEP** |
| Data | `Transaction`, `SIP`, `StockPrice` | **KEEP** (excluded from engine) |
| Data | `DailyJournal.signals` subdocument | **ADD** (additive, optional) |
| Data | `Insight`, `PatternRun` | **ADD** |
| Lib | `money.js`, `utils.js`, `week.js`, `mongoose.js`, `auth.js`, `groq.js` | **KEEP** |
| Lib | `features/patterns/*` | **ADD** |
| Finance | Expenses, Budget, Debts, Savings screens | **KEEP** |
| Habits | Heatmap, weekly goals, `compass/actions.js` | **KEEP** |
| Journal | Journal screen, calendar, mood strip, search | **KEEP** |
| Journal | Mood capture friction | **MODIFY** |
| Home | Dashboard at `/app` | **MODIFY** → moves to `/app/today` |
| Home | Lifeline component | **KEEP** — reused at the top of Discoveries |
| Home | Portfolio value card on home | **REMOVE** from home (screen retained) |
| Nav | Sidebar `NAV`, `"Modules"` label | **MODIFY** |
| Nav | `bottom-nav.jsx` TABS / MORE_LINKS | **MODIFY** |
| AI | `/api/ai/briefing` | **MODIFY** (add `Expense`; then supersede) |
| AI | `/api/journal/reflect` | **KEEP** — the correct persistence pattern |
| Weekly | `/app/review` | **MODIFY** → `/app/weekly` |
| Weekly | Per-goal star rating UI | **DEPRIORITIZE** (schema field retained) |
| Weekly | `PlannerReviewSummary` | **KEEP** |
| Portfolio | NEPSE vertical, CSV import, SIP, cron scraper | **DEPRIORITIZE** (fully functional, off the roadmap) |
| Planner | Hour-block grid | **DEPRIORITIZE** |
| Goals | `Goal.subScores` (IELTS) | **DEPRIORITIZE** |
| Brand | Deployed title/description ("Personal OS", "unified Super App") | **MODIFY** |

**Nothing in this blueprint deletes user data.**

---

# 12. Phase 1 readiness checklist

Before writing any code:

- [ ] Confirm `package.json` — Next.js version, `date-fns` major, existing dev tooling
- [ ] Confirm `vercel.json` cron configuration and plan limits
- [ ] Confirm `GROQ_API_KEY`, `CRON_SECRET`, `MONGODB_URI` are set in all environments
- [ ] Confirm the deployment timezone (`TZ`) and whether it's `Asia/Kathmandu`
- [ ] Snapshot the production database before Phase 3
- [ ] Decide: hand-rolled statistics (recommended) or `simple-statistics`
- [ ] Decide: is this single-user or multi-user? It changes TTL, cron and cost assumptions throughout

---

*End of blueprint. Each phase in §9 is written to be lifted out, prefixed with the Standing Rules, and handed over as a coding prompt.*