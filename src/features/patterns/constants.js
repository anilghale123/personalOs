/**
 * Tuning constants for the pattern engine.
 *
 * Everything that decides whether the product tells the user something is
 * true lives here, in one place, so the thresholds can be read and argued
 * with without reading the detectors.
 */

/**
 * Mood keys → an ordinal score.
 *
 * These five keys are the `mood` enum on `DailyJournal` and the `MOODS`
 * list in `features/journal/components/mood-picker.jsx`. That picker is a
 * `"use client"` module, so a server module cannot safely read its exports
 * — `signals.test.js` asserts these keys match the schema enum instead.
 */
export const MOOD_SCORE = {
  awful: 1,
  bad: 2,
  okay: 3,
  good: 4,
  amazing: 5,
};

/** Mood keys, weakest first — the order `MOOD_SCORE` is declared in. */
export const MOOD_KEYS = Object.keys(MOOD_SCORE);

/** Low / high mood buckets used by group-difference detectors. */
export const LOW_MOOD_MAX = 2;
export const HIGH_MOOD_MIN = 4;

// ── Windows ────────────────────────────────────────────────────────────

/** Default lookback for a pattern run. */
export const DEFAULT_WINDOW_DAYS = 90;

/** Hard ceiling on a signal window — longer requests are clamped. */
export const MAX_WINDOW_DAYS = 365;

// ── Significance and effect ────────────────────────────────────────────

/** Benjamini–Hochberg false-discovery rate. A pattern must clear this. */
export const FDR_Q = 0.1;

/** |ρ| floor for a correlation to count as a finding, not just noise. */
export const MIN_EFFECT_R = 0.3;

/** |δ| (Cliff's delta) floor for a group difference. */
export const MIN_EFFECT_CLIFF = 0.33;

/** Complete pairs required before a correlation is even tested. */
export const MIN_PAIRS_CORRELATION = 21;

/** Days required in each arm of a two-group comparison. */
export const MIN_GROUP_SIZE = 8;

/**
 * A window must contain at least this many days on which the user did
 * anything at all, however strong the arithmetic looks (§4.0).
 */
export const MIN_ACTIVE_DAYS = 14;

/**
 * If removing a single day moves the effect by more than this share, the
 * "pattern" is one day wearing a trenchcoat. Suppress it.
 */
export const OUTLIER_DOMINANCE_RATIO = 0.4;

// ── Runs and storage ───────────────────────────────────────────────────

/** Hours a stored run stays fresh before Discoveries triggers a new one. */
export const RUN_TTL_HOURS = 20;

/**
 * Manual "check for new patterns" runs allowed per day. Manual runs
 * bypass the TTL but not this — a run is a full multi-collection scan,
 * and once narration exists it costs LLM tokens too.
 */
export const MAX_MANUAL_RUNS_PER_DAY = 5;

/** Cap on scatter points persisted in an insight's evidence. */
export const EVIDENCE_MAX_POINTS = 200;

/** Cap on contributing days listed in an insight's evidence. */
export const EVIDENCE_MAX_TOP_DAYS = 10;

// ── Shared vocabulary ──────────────────────────────────────────────────

/** `QuickNote.type` enum, in display order. */
export const NOTE_TYPES = ["note", "idea", "task", "gratitude"];

/**
 * `PlannerGoal.days` keys indexed by day-of-week, Monday first — so
 * `PLANNER_DAY_KEYS[signal.dow]` is that day's status field.
 */
export const PLANNER_DAY_KEYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ── Statement templates ────────────────────────────────────────────────

/**
 * Verbs and phrases that assert causation. No rendered statement may
 * contain one, and `constants.test.js` checks every template against this
 * list — the guard has to sit at the detection layer, because by the time
 * a sentence reaches the narration prompt it is already too late.
 */
export const BANNED_CAUSAL_TERMS = [
  "causes",
  "caused",
  "causing",
  "makes you",
  "made you",
  "leads to",
  "led to",
  "results in",
  "resulted in",
  "because of",
  "due to",
  "drives",
  "driven by",
  "triggers",
  "triggered by",
  "improves",
  "worsens",
  "boosts",
  "prevents",
  "why you",
  "the reason",
  "explains",
];

/** Rupees from paisa, rounded to whole rupees — statements never show paisa. */
function rupees(paisa) {
  const value = Math.round((Number(paisa) || 0) / 100);
  return `NPR ${value.toLocaleString("en-IN")}`;
}

/** "62% more" / "18% less" — direction carried by the word, not a sign. */
function relativeChange(from, to) {
  const base = Math.abs(Number(from) || 0);
  if (!base) return null;
  const pct = Math.round(((to - from) / base) * 100);
  if (pct === 0) return null;
  return `${Math.abs(pct)}% ${pct > 0 ? "more" : "less"}`;
}

/** "1 day" / "3 days" — pluralisation the templates would otherwise fumble. */
function plural(n, singular, pluralForm = `${singular}s`) {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

/**
 * Every sentence the product can state as a finding.
 *
 * Detectors emit a `statementKey` and `statementVars`, never prose. That
 * keeps the wording consistent, keeps causal phrasing out by construction,
 * and means the LLM narration added later is additive rather than
 * load-bearing — if Groq is down, the feed still reads correctly.
 *
 * The language rule, enforced in review and by test: **associative only.**
 * "On days after you run, your mood averages 0.8 points higher" is
 * allowed. "Running improves your mood" is not.
 */
export const STATEMENT_TEMPLATES = {
  // ── Family A — money ↔ mood
  "mood_want_spend.higher": (v) =>
    `On low-mood days you spend ${relativeChange(v.highMoodPaisa, v.lowMoodPaisa) || "more"} on wants than on high-mood days — a typical ${rupees(
      v.lowMoodPaisa
    )} against ${rupees(v.highMoodPaisa)}.`,
  "mood_want_spend.lower": (v) =>
    `On low-mood days you spend ${relativeChange(v.highMoodPaisa, v.lowMoodPaisa) || "less"} on wants than on high-mood days — a typical ${rupees(
      v.lowMoodPaisa
    )} against ${rupees(v.highMoodPaisa)}.`,
  "mood_next_day_spend.positive": (v) =>
    `Days that follow a better mood tend to come with higher total spending, across ${plural(
      v.n,
      "day pair"
    )}.`,
  "mood_next_day_spend.negative": (v) =>
    `Days that follow a lower mood tend to come with higher total spending, across ${plural(
      v.n,
      "day pair"
    )}.`,
  "spend_then_mood.positive": (v) =>
    `Your mood the morning after a higher want-spending day tends to sit higher, across ${plural(
      v.n,
      "day pair"
    )}.`,
  "spend_then_mood.negative": (v) =>
    `Your mood the morning after a higher want-spending day tends to sit lower, across ${plural(
      v.n,
      "day pair"
    )}.`,

  // ── Family B — money ↔ habits
  "habit_day_spend.higher": (v) =>
    `On days you keep ${v.habit}, your spending runs ${relativeChange(
      v.missedPaisa,
      v.keptPaisa
    ) || "higher"} than on days you miss it.`,
  "habit_day_spend.lower": (v) =>
    `On days you keep ${v.habit}, your spending runs ${relativeChange(
      v.missedPaisa,
      v.keptPaisa
    ) || "lower"} than on days you miss it.`,

  // ── Family C — habits ↔ mood
  "habit_rate_mood.positive": (v) =>
    `Your habit completion and your mood move together — days with more habits kept are also days you rate higher, across ${plural(
      v.n,
      "day"
    )}.`,
  "habit_rate_mood.negative": (v) =>
    `Your habit completion and your mood move in opposite directions — days with more habits kept are days you rate lower, across ${plural(
      v.n,
      "day"
    )}.`,
  "habit_mood_next_day.positive": (v) =>
    `On days after you keep ${v.habit}, your mood averages ${v.delta} points higher than on days after you miss it.`,
  "habit_mood_next_day.negative": (v) =>
    `On days after you keep ${v.habit}, your mood averages ${v.delta} points lower than on days after you miss it.`,

  // ── Family D — journal ↔ everything
  "journal_day_spend.higher": (v) =>
    `On days you write in your journal, your spending runs ${relativeChange(
      v.silentPaisa,
      v.journalPaisa
    ) || "higher"} than on days you don't.`,
  "journal_day_spend.lower": (v) =>
    `On days you write in your journal, your spending runs ${relativeChange(
      v.silentPaisa,
      v.journalPaisa
    ) || "lower"} than on days you don't.`,
  "journal_length_mood.positive": (v) =>
    `Longer journal entries sit alongside higher mood ratings, across ${plural(
      v.n,
      "day"
    )} where you recorded both.`,
  "journal_length_mood.negative": (v) =>
    `Longer journal entries sit alongside lower mood ratings, across ${plural(
      v.n,
      "day"
    )} where you recorded both.`,
  "gratitude_mood.higher": (v) =>
    `Days carrying a gratitude note average ${v.delta} mood points higher than days without one.`,
  "gratitude_mood.lower": (v) =>
    `Days carrying a gratitude note average ${v.delta} mood points lower than days without one.`,
  "gratitude_next_day.higher": (v) =>
    `Days following a gratitude note average ${v.delta} mood points higher than days following none.`,
  "gratitude_next_day.lower": (v) =>
    `Days following a gratitude note average ${v.delta} mood points lower than days following none.`,

  // ── Family E — rhythm
  "dow_want_spend.peak": (v) =>
    `${v.day} is consistently your heaviest day for discretionary spending — a typical ${rupees(
      v.peakPaisa
    )} against ${rupees(v.restPaisa)} on other days.`,
  "weekend_mood.higher": (v) =>
    `Your weekend mood averages ${v.delta} points higher than your weekday mood.`,
  "weekend_mood.lower": (v) =>
    `Your weekend mood averages ${v.delta} points lower than your weekday mood.`,

  // ── Sentiment variants — the same questions asked of what was written
  "sentiment_want_spend.higher": (v) =>
    `On days you write in a lower tone, you spend ${relativeChange(v.highMoodPaisa, v.lowMoodPaisa) || "more"} on wants — a typical ${rupees(
      v.lowMoodPaisa
    )} against ${rupees(v.highMoodPaisa)}.`,
  "sentiment_want_spend.lower": (v) =>
    `On days you write in a lower tone, you spend ${relativeChange(v.highMoodPaisa, v.lowMoodPaisa) || "less"} on wants — a typical ${rupees(
      v.lowMoodPaisa
    )} against ${rupees(v.highMoodPaisa)}.`,
  "sentiment_habit_rate.positive": (v) =>
    `Days with more habits kept are also days you write in a warmer tone, across ${plural(
      v.n,
      "day"
    )}.`,
  "sentiment_habit_rate.negative": (v) =>
    `Days with more habits kept are days you write in a flatter tone, across ${plural(
      v.n,
      "day"
    )}.`,
  "spend_then_sentiment.positive": (v) =>
    `After a higher want-spending day, the next day's writing tends to run warmer, across ${plural(
      v.n,
      "day pair"
    )}.`,
  "spend_then_sentiment.negative": (v) =>
    `After a higher want-spending day, the next day's writing tends to run flatter, across ${plural(
      v.n,
      "day pair"
    )}.`,

  // ── Family F — budget ↔ behaviour
  "budget_pressure_mood.higher": (v) =>
    `Once your month-to-date spending has passed ${v.thresholdPct}% of your budget, your mood averages ${v.delta} points higher than earlier in the month.`,
  "budget_pressure_mood.lower": (v) =>
    `Once your month-to-date spending has passed ${v.thresholdPct}% of your budget, your mood averages ${v.delta} points lower than earlier in the month.`,
};

/**
 * Render a finding as its one deterministic sentence.
 * @param {string} key
 * @param {object} vars
 * @returns {string}
 */
export function renderStatement(key, vars = {}) {
  const template = STATEMENT_TEMPLATES[key];
  if (!template) throw new Error(`Unknown statement template: ${key}`);
  return template(vars);
}

/**
 * Standing caveats attached to findings whose shape is known to be
 * ambiguous. These surface in the "what this doesn't tell you" block,
 * which is never collapsed.
 */
export const CAVEATS = {
  bidirectional:
    "This runs both ways — feeling good makes habits easier, and keeping habits can sit alongside feeling good. Neither order is established here.",
  weekend_confound:
    "Weekends differ from weekdays in mood and in spending, so some of this may be the week's shape rather than the thing being measured.",
  selective_logging:
    "This only sees days you logged. If you log more on some kinds of day than others, that pattern shows up here as a real one.",
  recurring_excluded:
    "Recurring and auto-generated expenses are excluded, so rent and subscriptions are not behind this.",
  proxy_only:
    "This is a proxy, not the thing itself — there is no income data in the app to compare against.",
  small_window: "Measured over a short window; it may not hold as more days arrive.",
};

/**
 * Ranking weight per detector. Forward-looking findings earn their place
 * at the top; the obvious ones are useful in a sparse feed but must never
 * outrank a lagged discovery.
 */
export const RANK_BOOST = {
  habit_mood_next_day: 1.35,
  spend_then_mood: 1.25,
  mood_next_day_spend: 1.25,
  mood_want_spend: 1.1,
  budget_pressure_mood: 1.05,
  weekend_mood: 0.55,
  dow_want_spend: 0.8,
};

/** Most results any one family may contribute to a single run (§4.0). */
export const MAX_RESULTS_PER_FAMILY = 3;

/**
 * Domains reported by `GET /api/patterns/readiness`, in the order the
 * empty state shows them. `target` is the days of coverage the cheapest
 * detector in that family needs — the honest "how much more" number.
 */
export const READINESS_DOMAINS = [
  {
    id: "mood",
    label: "Mood",
    target: 24,
    unlocks: "How your spending and habits move with how you feel",
  },
  {
    id: "money",
    label: "Expenses",
    target: 24,
    unlocks: "Spending rhythms, and what your mood does to them",
  },
  {
    id: "habits",
    label: "Habits",
    target: 24,
    unlocks: "Whether keeping a habit shows up in the next day",
  },
  {
    id: "journal",
    label: "Journal",
    target: 24,
    unlocks: "What writing days look like compared with quiet ones",
  },
  {
    id: "notes",
    label: "Quick notes",
    target: 10,
    unlocks: "Gratitude notes and how they sit alongside mood",
  },
];
