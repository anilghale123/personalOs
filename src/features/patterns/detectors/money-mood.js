/**
 * Family A — money ↔ mood.
 *
 * The lagged detectors here (A2, A3) are the interesting ones. Same-day
 * mood and same-day spending are entangled: you feel a certain way and
 * you spend on the same afternoon, and neither ordering is recoverable.
 * Yesterday predicting today is a genuine finding.
 */

import { laggedPairs, quantile } from "../stats";
import { HIGH_MOOD_MIN, LOW_MOOD_MAX } from "../constants";
import { compareGroups, correlate, round } from "./shared";

/** A1 — discretionary spending on low-mood days versus high-mood days. */
export const moodWantSpend = {
  id: "mood_want_spend",
  title: "Mood and discretionary spending",
  domains: ["journal", "money"],
  family: "money-mood",
  requires: ["mood", "money"],
  minSample: 24,

  run(signals) {
    const moodDays = signals.filter((s) => s.hasMood);
    if (moodDays.length < this.minSample) {
      return { results: [], skipped: { reason: "mood_days", have: moodDays.length, need: this.minSample } };
    }

    // Someone who only logs expenses on stressful days would show a
    // spectacular — and entirely fake — pattern here.
    const logged = moodDays.filter((s) => s.hasMoneyData);
    if (logged.length / moodDays.length < 0.6) {
      return {
        results: [],
        skipped: { reason: "selective_expense_logging", rate: logged.length / moodDays.length },
      };
    }

    const toDay = (s) => ({ date: s.date, value: s.spendWantPaisa });
    const stat = compareGroups({
      a: { label: "Low-mood days", days: logged.filter((s) => s.moodScore <= LOW_MOOD_MAX).map(toDay) },
      b: { label: "High-mood days", days: logged.filter((s) => s.moodScore >= HIGH_MOOD_MIN).map(toDay) },
      unit: "paisa",
      caveats: ["selective_logging"],
    });
    if (!stat) return [];

    return [
      {
        detectorId: this.id,
        params: {},
        title: this.title,
        domains: this.domains,
        family: this.family,
        minSample: this.minSample,
        statementKey: `mood_want_spend.${stat.direction === "positive" ? "higher" : "lower"}`,
        statementVars: {
          lowMoodPaisa: stat.summary.aMedian,
          highMoodPaisa: stat.summary.bMedian,
        },
        ...stat,
      },
    ];
  },
};

/** A2 — mood today against total spending tomorrow. */
export const moodNextDaySpend = {
  id: "mood_next_day_spend",
  title: "Mood today, spending tomorrow",
  domains: ["journal", "money"],
  family: "money-mood",
  requires: ["mood", "money"],
  minSample: 21,

  run(signals) {
    // Explicit nulls, so a day with nothing logged is never read as a day
    // on which nothing was spent.
    const rows = signals.map((s) => ({
      date: s.date,
      x: s.hasMood ? s.moodScore : null,
      y: s.hasMoneyData ? s.spendTotalPaisa : null,
    }));

    const { xs, ys, dates, possible } = laggedPairs(rows, "x", "y", 1);
    if (possible > 0 && 1 - xs.length / possible > 0.3) {
      return {
        results: [],
        skipped: { reason: "pair_gap_rate", gapRate: 1 - xs.length / possible },
      };
    }

    const stat = correlate({
      xs,
      ys,
      dates,
      xLabel: "Mood (day d)",
      yLabel: "Total spend (day d+1)",
      minPairs: this.minSample,
      caveats: ["selective_logging"],
    });
    if (!stat) return [];

    return [
      {
        detectorId: this.id,
        params: { lag: 1 },
        title: this.title,
        domains: this.domains,
        family: this.family,
        minSample: this.minSample,
        statementKey: `mood_next_day_spend.${stat.direction}`,
        statementVars: { n: stat.n },
        ...stat,
      },
    ];
  },
};

/** A3 — discretionary spending today against mood tomorrow. */
export const spendThenMood = {
  id: "spend_then_mood",
  title: "Spending today, mood tomorrow",
  domains: ["money", "journal"],
  family: "money-mood",
  requires: ["mood", "money"],
  minSample: 21,

  run(signals) {
    const rows = signals.map((s) => ({
      date: s.date,
      x: s.hasMoneyData ? s.spendWantManualPaisa : null,
      y: s.hasMood ? s.moodScore : null,
    }));

    const { xs, ys, dates, possible } = laggedPairs(rows, "x", "y", 1);
    if (possible > 0 && 1 - xs.length / possible > 0.3) {
      return {
        results: [],
        skipped: { reason: "pair_gap_rate", gapRate: 1 - xs.length / possible },
      };
    }

    const stat = correlate({
      xs,
      ys,
      dates,
      xLabel: "Want spend (day d)",
      yLabel: "Mood (day d+1)",
      minPairs: this.minSample,
      caveats: ["selective_logging", "recurring_excluded"],
    });
    if (!stat) return [];

    return [
      {
        detectorId: this.id,
        params: { lag: 1 },
        title: this.title,
        domains: this.domains,
        family: this.family,
        minSample: this.minSample,
        statementKey: `spend_then_mood.${stat.direction}`,
        statementVars: { n: stat.n },
        ...stat,
        evidence: {
          ...stat.evidence,
          // The "purchase regret" comparison the correlation implies, kept
          // as description rather than tested as a second hypothesis —
          // one question asked twice would inflate the FDR budget.
          topQuintileContrast: topQuintileContrast(xs, ys),
        },
      },
    ];
  },
};

/** Mean next-day mood after the heaviest want-spend days, against the rest. */
function topQuintileContrast(xs, ys) {
  const cutoff = quantile(xs, 0.8);
  if (cutoff === null) return null;
  const heavy = [];
  const rest = [];
  for (let i = 0; i < xs.length; i++) (xs[i] >= cutoff ? heavy : rest).push(ys[i]);
  if (!heavy.length || !rest.length) return null;
  return {
    cutoffPaisa: cutoff,
    heavy: { n: heavy.length, meanMood: round(heavy.reduce((a, b) => a + b, 0) / heavy.length, 2) },
    rest: { n: rest.length, meanMood: round(rest.reduce((a, b) => a + b, 0) / rest.length, 2) },
  };
}

const MONEY_MOOD_DETECTORS = [moodWantSpend, moodNextDaySpend, spendThenMood];

export default MONEY_MOOD_DETECTORS;
