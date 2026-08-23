/**
 * Weekly Discoveries — what was learned this week, and whether what we
 * learned before still holds.
 *
 * The check-in is the emotional core of the whole product: "three weeks
 * ago we noticed you spend more after low-mood days — it held again this
 * week" is a relationship with the user's own history, and no budgeting
 * app or habit tracker can offer it. It exists only because insights are
 * upserted by fingerprint rather than re-inserted, so each one carries a
 * `strengthHistory` worth checking against.
 *
 * Everything here is pure: insights and signals in, a digest out. The
 * LLM is handed the finished digest and writes prose about it.
 */

import { mean } from "./stats";
import { fromMinorUnits } from "@/lib/money";

/** How a known pattern fared this week. */
export const CHECK_IN = {
  NEW: "new",
  STRENGTHENED: "strengthened",
  HELD: "held",
  WEAKENED: "weakened",
  FADED: "faded",
};

/** Beyond ±15% we call it a change rather than noise. */
const DRIFT = 0.15;

/**
 * Classify one insight against the week just gone.
 *
 * @param {object} insight   stored insight with `strengthHistory`
 * @param {string} weekStart 'YYYY-MM-DD' Monday
 * @param {string} weekEnd   'YYYY-MM-DD' Sunday
 */
export function classifyCheckIn(insight, weekStart, weekEnd) {
  const startMs = new Date(`${weekStart}T00:00:00`).getTime();
  const endMs = new Date(`${weekEnd}T23:59:59`).getTime();

  const firstSeen = insight.firstDetectedAt
    ? new Date(insight.firstDetectedAt).getTime()
    : null;
  if (firstSeen !== null && firstSeen >= startMs && firstSeen <= endMs) {
    return CHECK_IN.NEW;
  }

  if (insight.status === "stale") return CHECK_IN.FADED;

  const history = (insight.strengthHistory ?? []).filter((h) => h?.date);
  const thisWeek = history.filter((h) => {
    const at = new Date(h.date).getTime();
    return at >= startMs && at <= endMs;
  });
  const before = history.filter((h) => new Date(h.date).getTime() < startMs);

  // Confirmed before but not looked at this week — no news either way.
  if (!thisWeek.length) return null;
  if (!before.length) return CHECK_IN.HELD;

  const now = Math.abs(thisWeek[thisWeek.length - 1].value ?? 0);
  const then = Math.abs(before[before.length - 1].value ?? 0);
  if (!then) return CHECK_IN.HELD;

  if (now > then * (1 + DRIFT)) return CHECK_IN.STRENGTHENED;
  if (now < then * (1 - DRIFT)) return CHECK_IN.WEAKENED;
  return CHECK_IN.HELD;
}

/**
 * The week in pre-computed numbers.
 *
 * Every figure the reflection prompt is allowed to mention is produced
 * here, in JavaScript, from the signal layer — the model never adds,
 * averages or compares anything itself.
 *
 * @param {object[]} signals       this week's daily signals
 * @param {object[]} priorSignals  the week before, for the deltas
 */
export function summariseWeek(signals, priorSignals = []) {
  const week = describe(signals);
  const prior = describe(priorSignals);

  return {
    daysRecorded: week.activeDays,
    spendRupees: week.spendRupees,
    spendChangePercent: percentChange(prior.spendRupees, week.spendRupees),
    wantSpendRupees: week.wantRupees,
    moodDaysRecorded: week.moodDays,
    averageMood: week.averageMood,
    moodChange: round(delta(prior.averageMood, week.averageMood), 1),
    habitCompletionPercent: week.habitPercent,
    habitChangePercent: percentChange(prior.habitPercent, week.habitPercent),
    journalDays: week.journalDays,
    journalWords: week.journalWords,
    gratitudeNotes: week.gratitudeNotes,
  };
}

function describe(signals) {
  const rows = signals ?? [];
  const moods = rows.filter((s) => s.hasMood).map((s) => s.moodScore);
  const habitDays = rows.filter((s) => s.habitsTracked > 0).map((s) => s.habitRate);

  return {
    activeDays: rows.filter(
      (s) => s.hasMood || s.hasMoneyData || s.hasJournal || s.habitsTracked > 0
    ).length,
    spendRupees: Math.round(
      fromMinorUnits(rows.reduce((sum, s) => sum + s.spendTotalPaisa, 0))
    ),
    wantRupees: Math.round(
      fromMinorUnits(rows.reduce((sum, s) => sum + s.spendWantPaisa, 0))
    ),
    moodDays: moods.length,
    averageMood: moods.length ? round(mean(moods), 1) : null,
    habitPercent: habitDays.length ? Math.round(mean(habitDays) * 100) : null,
    journalDays: rows.filter((s) => s.hasJournal).length,
    journalWords: rows.reduce((sum, s) => sum + s.journalWords, 0),
    gratitudeNotes: rows.reduce((sum, s) => sum + (s.noteCountByType?.gratitude ?? 0), 0),
  };
}

/**
 * The whole digest: what's new, what held, and the week's shape.
 *
 * @returns {{weekStart: string, weekEnd: string, newPatterns: object[], checkIns: object[], weekSummary: object, testedCount: number}}
 */
export function buildWeeklyDigest({
  insights = [],
  signals = [],
  priorSignals = [],
  weekStart,
  weekEnd,
  testedCount = 0,
}) {
  const classified = insights
    .map((insight) => ({
      insight,
      outcome: classifyCheckIn(insight, weekStart, weekEnd),
    }))
    .filter((row) => row.outcome !== null);

  const newPatterns = classified
    .filter((row) => row.outcome === CHECK_IN.NEW)
    .map((row) => row.insight);

  const checkIns = classified
    .filter((row) => row.outcome !== CHECK_IN.NEW)
    .map((row) => ({
      id: row.insight.id ?? String(row.insight._id ?? ""),
      statement: row.insight.statement,
      outcome: row.outcome,
      timesConfirmed: row.insight.timesConfirmed,
      firstDetectedAt: row.insight.firstDetectedAt,
    }));

  return {
    weekStart,
    weekEnd,
    newPatterns,
    checkIns,
    weekSummary: summariseWeek(signals, priorSignals),
    testedCount,
  };
}

/**
 * The digest reduced to the numbers and sentences the model may use.
 * No dates, no evidence rows, no journal text.
 */
export function weeklyPromptPayload(digest) {
  return {
    newPatterns: digest.newPatterns.map((p) => ({
      statement: p.statement,
      confidence: p.confidence,
      daysMeasured: p.n,
    })),
    checkIns: digest.checkIns.map((c) => ({
      statement: c.statement,
      outcome: c.outcome,
      timesConfirmed: c.timesConfirmed,
    })),
    weekSummary: digest.weekSummary,
  };
}

/** §7.5 — the weekly reflection prompt. */
export function buildWeeklyPrompt(digest) {
  const payload = weeklyPromptPayload(digest);
  return `Write a short weekly reflection for someone reviewing their own week.

NEW PATTERNS (validated, do not recalculate): ${JSON.stringify(payload.newPatterns)}
PATTERN CHECK-INS (held or faded): ${JSON.stringify(payload.checkIns)}
WEEK SUMMARY (pre-computed): ${JSON.stringify(payload.weekSummary)}

Structure:
1. One sentence naming the shape of the week
2. The most interesting new discovery, in plain language
3. Whether last week's patterns held
4. One genuine question worth sitting with — not advice

Rules: use only the numbers provided; association not causation; warm but
not saccharine; never scold; under 220 words.`;
}

/** Human copy for a check-in outcome. */
export const CHECK_IN_LABEL = {
  [CHECK_IN.NEW]: "New this week",
  [CHECK_IN.STRENGTHENED]: "Stronger than before",
  [CHECK_IN.HELD]: "Held again",
  [CHECK_IN.WEAKENED]: "Weaker than before",
  [CHECK_IN.FADED]: "No longer holding",
};

function delta(before, after) {
  if (before === null || after === null) return null;
  return after - before;
}

function percentChange(before, after) {
  if (!before || before === 0 || after === null || after === undefined) return null;
  return Math.round(((after - before) / Math.abs(before)) * 100);
}

function round(value, places) {
  if (value === null || value === undefined) return null;
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
