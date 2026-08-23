/**
 * Family E — rhythm.
 *
 * The findings most likely to fire early and least likely to surprise
 * anyone. They earn their place in a sparse feed as a confidence-builder,
 * but they are ranked below anything that points forward.
 */

import { cliffsDelta, kruskalWallis, mean, median, permutationPKruskal } from "../stats";
import { compareGroups, round } from "./shared";

const WEEKDAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

/** E1 — is one weekday consistently heavier for discretionary spending? */
export const dowWantSpend = {
  id: "dow_want_spend",
  title: "Day-of-week spending",
  domains: ["money"],
  family: "rhythm",
  requires: ["money"],
  minSample: 28,

  run(signals) {
    // Recurring entries that always land on the same weekday would
    // otherwise produce a "pattern" that is really a standing order.
    const days = signals.filter((s) => s.hasMoneyData);
    const groups = WEEKDAY_NAMES.map((_, dow) =>
      days.filter((s) => s.dow === dow).map((s) => s.spendWantManualPaisa)
    );

    const perDay = groups.map((g) => g.length);
    if (Math.min(...perDay) < 4 || days.length < this.minSample) {
      return {
        results: [],
        skipped: { reason: "weekday_coverage", perDay, need: 4 },
      };
    }

    const omnibus = kruskalWallis(groups);
    if (!omnibus) return [];

    // The omnibus test decides significance; the peak-versus-rest split
    // below is description, so it cannot smuggle in a second hypothesis.
    let peak = 0;
    for (let i = 1; i < groups.length; i++) {
      if (median(groups[i]) > median(groups[peak])) peak = i;
    }
    const peakValues = groups[peak];
    const restValues = groups.filter((_, i) => i !== peak).flat();
    const delta = cliffsDelta(peakValues, restValues);

    return [
      {
        detectorId: this.id,
        params: { dow: peak },
        title: this.title,
        domains: this.domains,
        family: this.family,
        minSample: this.minSample,
        statementKey: "dow_want_spend.peak",
        statementVars: {
          day: WEEKDAY_NAMES[peak],
          peakPaisa: median(peakValues),
          restPaisa: median(restValues),
        },
        n: days.length,
        pValue: permutationPKruskal(groups),
        direction: "positive",
        effect: {
          type: "group_difference",
          value: median(peakValues) - median(restValues),
          unit: "paisa",
          standardised: delta,
        },
        summary: {
          h: omnibus.h,
          df: omnibus.df,
          chiSquareP: omnibus.p,
          medianByDow: groups.map((g) => median(g)),
          meanByDow: groups.map((g) => mean(g)),
        },
        evidence: {
          kind: "categorical",
          xLabel: "Day of week",
          yLabel: "Discretionary spend",
          groups: WEEKDAY_NAMES.map((label, i) => ({
            label,
            n: groups[i].length,
            median: median(groups[i]),
            mean: mean(groups[i]),
            isPeak: i === peak,
          })),
          points: days.map((s) => ({
            date: s.date,
            x: s.dow,
            y: s.spendWantManualPaisa,
          })),
          topDays: [...days]
            .sort((a, b) => b.spendWantManualPaisa - a.spendWantManualPaisa)
            .slice(0, 10)
            .map((s) => ({ date: s.date, value: s.spendWantManualPaisa, group: WEEKDAY_NAMES[s.dow] })),
          caveats: ["recurring_excluded", "selective_logging"],
        },
        _loo: { kind: "two_group", a: peakValues, b: restValues },
      },
    ];
  },
};

/** E2 — weekend mood against weekday mood. */
export const weekendMood = {
  id: "weekend_mood",
  title: "Weekend and weekday mood",
  domains: ["journal"],
  family: "rhythm",
  requires: ["mood"],
  minSample: 20,

  run(signals) {
    const moodDays = signals.filter((s) => s.hasMood);
    const toDay = (s) => ({ date: s.date, value: s.moodScore });

    const stat = compareGroups({
      a: { label: "Weekend days", days: moodDays.filter((s) => s.isWeekend).map(toDay) },
      b: { label: "Weekdays", days: moodDays.filter((s) => !s.isWeekend).map(toDay) },
      unit: "mood_points",
      minGroupSize: 10,
    });
    if (!stat) {
      return { results: [], skipped: { reason: "mood_days", have: moodDays.length, need: this.minSample } };
    }

    return [
      {
        detectorId: this.id,
        params: {},
        title: this.title,
        domains: this.domains,
        family: this.family,
        minSample: this.minSample,
        statementKey: `weekend_mood.${stat.direction === "positive" ? "higher" : "lower"}`,
        statementVars: { delta: Math.abs(round(stat.summary.meanDelta, 1)) },
        ...stat,
      },
    ];
  },
};

const RHYTHM_DETECTORS = [dowWantSpend, weekendMood];

export default RHYTHM_DETECTORS;
