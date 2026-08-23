/**
 * Family F — budget ↔ behaviour.
 *
 * The only family that needs something outside the signal series: the
 * budget limits themselves, which the engine supplies through `ctx` by
 * calling `computeBudgetSummary` — carry-forward logic and all — rather
 * than reimplementing it here.
 */

import { BUDGET_WARNING_RATIO } from "@/features/budget/constants";
import { compareGroups, round } from "./shared";

/** F1 — mood before and after month-to-date spend crosses the warning line. */
export const budgetPressureMood = {
  id: "budget_pressure_mood",
  title: "Budget pressure and mood",
  domains: ["money", "journal"],
  family: "budget-behaviour",
  requires: ["mood", "money"],
  minSample: 20,

  run(signals, ctx = {}) {
    const budgets = ctx.monthlyBudgets ?? {};
    // Only months the window covers from the 1st — a month joined halfway
    // through has no true month-to-date figure.
    const usableMonths = Object.keys(budgets).filter(
      (month) => budgets[month] > 0 && ctx.fullMonths?.includes(month)
    );
    if (usableMonths.length < 2) {
      return {
        results: [],
        skipped: { reason: "budgeted_months", have: usableMonths.length, need: 2 },
      };
    }

    const underPressure = [];
    const early = [];
    const runningByMonth = {};

    for (const s of signals) {
      const month = s.date.slice(0, 7);
      if (!usableMonths.includes(month)) continue;

      // Classify on spend *before* today, so a day is not labelled by the
      // very spending that happened during it.
      const before = runningByMonth[month] ?? 0;
      runningByMonth[month] = before + s.spendTotalPaisa;

      if (!s.hasMood) continue;
      const day = { date: s.date, value: s.moodScore };
      (before >= budgets[month] * BUDGET_WARNING_RATIO ? underPressure : early).push(day);
    }

    const stat = compareGroups({
      a: { label: "Days past the budget warning line", days: underPressure },
      b: { label: "Days before it", days: early },
      unit: "mood_points",
      minGroupSize: 10,
      // Later days in a month are also further from payday, further into
      // whatever the month held, and so on.
      caveats: ["proxy_only"],
    });
    if (!stat) {
      return {
        results: [],
        skipped: {
          reason: "group_size",
          pressured: underPressure.length,
          early: early.length,
          need: 10,
        },
      };
    }

    return [
      {
        detectorId: this.id,
        params: {},
        title: this.title,
        domains: this.domains,
        family: this.family,
        minSample: this.minSample,
        statementKey: `budget_pressure_mood.${stat.direction === "positive" ? "higher" : "lower"}`,
        statementVars: {
          thresholdPct: Math.round(BUDGET_WARNING_RATIO * 100),
          delta: Math.abs(round(stat.summary.meanDelta, 1)),
        },
        ...stat,
      },
    ];
  },
};

const BUDGET_DETECTORS = [budgetPressureMood];

export default BUDGET_DETECTORS;
