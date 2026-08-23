/**
 * Family B — money ↔ habits.
 *
 * Parameterised: one hypothesis per habit. Every one of those is a real
 * test and has to be counted as such, so the detector reports how many it
 * ran even when it returns only the strongest few.
 */

import { MAX_RESULTS_PER_FAMILY } from "../constants";
import { compareGroups } from "./shared";

/** Habits with enough contrast on both sides to be worth testing at all. */
export function testableHabits(signals, { minPerGroup = 12, minRate = 0.15, maxRate = 0.85 } = {}) {
  const tally = new Map();
  for (const s of signals) {
    for (const [name, done] of Object.entries(s.habitByName)) {
      const row = tally.get(name) ?? { kept: 0, missed: 0 };
      if (done) row.kept++;
      else row.missed++;
      tally.set(name, row);
    }
  }

  const out = [];
  for (const [name, { kept, missed }] of tally) {
    const total = kept + missed;
    const rate = kept / total;
    // A habit kept every day, or almost never, has no contrast to measure.
    if (rate < minRate || rate > maxRate) continue;
    if (kept < minPerGroup || missed < minPerGroup) continue;
    out.push({ name, kept, missed, rate });
  }
  return out;
}

/** B1 — spending on days a habit was kept, against days it was missed. */
export const habitDaySpend = {
  id: "habit_day_spend",
  title: "Habits and daily spending",
  domains: ["habits", "money"],
  family: "money-habits",
  requires: ["habits", "money"],
  minSample: 24,

  run(signals) {
    const habits = testableHabits(signals);
    if (!habits.length) {
      return { results: [], skipped: { reason: "no_habit_with_contrast" } };
    }

    const results = [];
    for (const habit of habits) {
      const days = signals.filter(
        (s) => s.hasMoneyData && s.habitByName[habit.name] !== undefined
      );
      const toDay = (s) => ({ date: s.date, value: s.spendTotalPaisa });

      const stat = compareGroups({
        a: { label: `Days you kept ${habit.name}`, days: days.filter((s) => s.habitByName[habit.name]).map(toDay) },
        b: { label: `Days you missed ${habit.name}`, days: days.filter((s) => !s.habitByName[habit.name]).map(toDay) },
        unit: "paisa",
        minGroupSize: 12,
        caveats: ["selective_logging"],
      });
      if (!stat) continue;

      results.push({
        detectorId: this.id,
        params: { habitName: habit.name },
        title: this.title,
        domains: this.domains,
        family: this.family,
        minSample: this.minSample,
        statementKey: `habit_day_spend.${stat.direction === "positive" ? "higher" : "lower"}`,
        statementVars: {
          habit: habit.name,
          keptPaisa: stat.summary.aMedian,
          missedPaisa: stat.summary.bMedian,
        },
        ...stat,
      });
    }

    // Keep the strongest few so the feed doesn't become a spreadsheet —
    // but report every hypothesis tested, or trimming the list here would
    // quietly weaken the correction that runs downstream.
    results.sort(
      (a, b) => Math.abs(b.effect.standardised) - Math.abs(a.effect.standardised)
    );
    return {
      results: results.slice(0, MAX_RESULTS_PER_FAMILY),
      hypothesesTested: habits.length,
    };
  },
};

const MONEY_HABIT_DETECTORS = [habitDaySpend];

export default MONEY_HABIT_DETECTORS;
