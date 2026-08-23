/**
 * Family C — habits ↔ mood.
 *
 * C2 is the most actionable shape in the whole set, because it points
 * forward: it says something about tomorrow rather than restating today.
 * The ranking weights reflect that.
 */

import { pairwise } from "../stats";
import { MAX_RESULTS_PER_FAMILY } from "../constants";
import { compareGroups, correlate, round } from "./shared";
import { testableHabits } from "./money-habits";
import { addDays } from "../dates";

/** C1 — same-day habit completion against mood. */
export const habitRateMood = {
  id: "habit_rate_mood",
  title: "Habits and mood, same day",
  domains: ["habits", "journal"],
  family: "habits-mood",
  requires: ["habits", "mood"],
  minSample: 24,

  run(signals) {
    const { xs, ys, dates } = pairwise(signals, "habitRate", "moodScore");

    const stat = correlate({
      xs,
      ys,
      dates,
      xLabel: "Habit completion rate",
      yLabel: "Mood",
      minPairs: this.minSample,
      // Feeling good makes habits easier and keeping habits sits
      // alongside feeling good. The template says "move together".
      caveats: ["bidirectional"],
    });
    if (!stat) {
      return { results: [], skipped: { reason: "pairs", have: xs.length, need: this.minSample } };
    }

    return [
      {
        detectorId: this.id,
        params: {},
        title: this.title,
        domains: this.domains,
        family: this.family,
        minSample: this.minSample,
        statementKey: `habit_rate_mood.${stat.direction}`,
        statementVars: { n: stat.n },
        ...stat,
      },
    ];
  },
};

/** C2 — a habit today against mood tomorrow, one hypothesis per habit. */
export const habitMoodNextDay = {
  id: "habit_mood_next_day",
  title: "Habits today, mood tomorrow",
  domains: ["habits", "journal"],
  family: "habits-mood",
  requires: ["habits", "mood"],
  minSample: 24,

  run(signals) {
    const habits = testableHabits(signals);
    if (!habits.length) {
      return { results: [], skipped: { reason: "no_habit_with_contrast" } };
    }

    const byDate = new Map(signals.map((s) => [s.date, s]));
    const results = [];

    for (const habit of habits) {
      const kept = [];
      const missed = [];
      for (const s of signals) {
        const done = s.habitByName[habit.name];
        if (done === undefined) continue;
        const tomorrow = byDate.get(addDays(s.date, 1));
        if (!tomorrow?.hasMood) continue;
        (done ? kept : missed).push({ date: tomorrow.date, value: tomorrow.moodScore });
      }

      const stat = compareGroups({
        a: { label: `Days after you kept ${habit.name}`, days: kept },
        b: { label: `Days after you missed ${habit.name}`, days: missed },
        unit: "mood_points",
        minGroupSize: 12,
      });
      if (!stat) continue;

      results.push({
        detectorId: this.id,
        params: { habitName: habit.name },
        title: this.title,
        domains: this.domains,
        family: this.family,
        minSample: this.minSample,
        statementKey: `habit_mood_next_day.${stat.direction === "positive" ? "positive" : "negative"}`,
        statementVars: {
          habit: habit.name,
          delta: Math.abs(round(stat.summary.meanDelta, 1)),
        },
        ...stat,
      });
    }

    results.sort(
      (a, b) => Math.abs(b.effect.standardised) - Math.abs(a.effect.standardised)
    );
    return {
      results: results.slice(0, MAX_RESULTS_PER_FAMILY),
      hypothesesTested: habits.length,
    };
  },
};

const HABIT_MOOD_DETECTORS = [habitRateMood, habitMoodNextDay];

export default HABIT_MOOD_DETECTORS;
