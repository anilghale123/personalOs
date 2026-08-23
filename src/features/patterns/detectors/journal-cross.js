/**
 * Family D — journal ↔ everything.
 *
 * The gentlest family, and the one that most needs watching: findings
 * about when someone does and doesn't write about their life can read as
 * accusatory very easily. The templates here stay descriptive.
 */

import { median, pairwise } from "../stats";
import { compareGroups, correlate, round } from "./shared";
import { addDays } from "../dates";

/** D1 — spending on days with a journal entry, against silent days. */
export const journalDaySpend = {
  id: "journal_day_spend",
  title: "Writing days and spending",
  domains: ["journal", "money"],
  family: "journal-cross",
  requires: ["journal", "money"],
  minSample: 24,

  run(signals) {
    const logged = signals.filter((s) => s.hasMoneyData);
    const rate = logged.length
      ? logged.filter((s) => s.hasJournal).length / logged.length
      : 0;
    // Almost-always or almost-never writing leaves nothing to contrast.
    if (rate > 0.9 || rate < 0.1) {
      return { results: [], skipped: { reason: "journaling_rate", rate } };
    }

    const toDay = (s) => ({ date: s.date, value: s.spendTotalPaisa });
    const stat = compareGroups({
      a: { label: "Days you wrote", days: logged.filter((s) => s.hasJournal).map(toDay) },
      b: { label: "Days you didn't", days: logged.filter((s) => !s.hasJournal).map(toDay) },
      unit: "paisa",
      minGroupSize: 12,
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
        statementKey: `journal_day_spend.${stat.direction === "positive" ? "higher" : "lower"}`,
        statementVars: {
          journalPaisa: stat.summary.aMedian,
          silentPaisa: stat.summary.bMedian,
        },
        ...stat,
      },
    ];
  },
};

/** D2 — how much you wrote, against how you rated the day. */
export const journalLengthMood = {
  id: "journal_length_mood",
  title: "Entry length and mood",
  domains: ["journal"],
  family: "journal-cross",
  requires: ["journal", "mood"],
  minSample: 24,

  run(signals) {
    const written = signals.filter((s) => s.hasJournal && s.hasMood);
    const typicalLength = median(written.map((s) => s.journalWords));
    // Below roughly twenty words the length carries no information.
    if (typicalLength !== null && typicalLength < 20) {
      return { results: [], skipped: { reason: "entries_too_short", medianWords: typicalLength } };
    }

    const { xs, ys, dates } = pairwise(written, "journalWords", "moodScore");
    const stat = correlate({
      xs,
      ys,
      dates,
      xLabel: "Words written",
      yLabel: "Mood",
      minPairs: this.minSample,
      // Long entries can mean processing or rumination; the direction
      // alone does not distinguish them.
      caveats: ["bidirectional"],
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
        statementKey: `journal_length_mood.${stat.direction}`,
        statementVars: { n: stat.n },
        ...stat,
      },
    ];
  },
};

/**
 * D3 — gratitude notes and mood, same day and the day after.
 *
 * Two genuinely different questions, so two hypotheses, both counted.
 */
export const gratitudeMood = {
  id: "gratitude_mood",
  title: "Gratitude notes and mood",
  domains: ["journal"],
  family: "journal-cross",
  requires: ["notes", "mood"],
  minSample: 20,

  run(signals) {
    const byDate = new Map(signals.map((s) => [s.date, s]));
    const gratitudeDays = signals.filter((s) => s.noteCountByType.gratitude > 0);
    if (gratitudeDays.length < 10) {
      return { results: [], skipped: { reason: "gratitude_days", have: gratitudeDays.length, need: 10 } };
    }

    const results = [];

    // Same day.
    const sameDay = compareGroups({
      a: {
        label: "Days with a gratitude note",
        days: signals
          .filter((s) => s.hasMood && s.noteCountByType.gratitude > 0)
          .map((s) => ({ date: s.date, value: s.moodScore })),
      },
      b: {
        label: "Days without one",
        days: signals
          .filter((s) => s.hasMood && s.noteCountByType.gratitude === 0)
          .map((s) => ({ date: s.date, value: s.moodScore })),
      },
      unit: "mood_points",
      minGroupSize: 10,
      caveats: ["bidirectional"],
    });
    if (sameDay) {
      results.push({
        detectorId: this.id,
        params: { lag: 0 },
        title: this.title,
        domains: this.domains,
        family: this.family,
        minSample: this.minSample,
        statementKey: `gratitude_mood.${sameDay.direction === "positive" ? "higher" : "lower"}`,
        statementVars: { delta: Math.abs(round(sameDay.summary.meanDelta, 1)) },
        ...sameDay,
      });
    }

    // Next day.
    const withNote = [];
    const without = [];
    for (const s of signals) {
      const tomorrow = byDate.get(addDays(s.date, 1));
      if (!tomorrow?.hasMood) continue;
      const day = { date: tomorrow.date, value: tomorrow.moodScore };
      (s.noteCountByType.gratitude > 0 ? withNote : without).push(day);
    }
    const nextDay = compareGroups({
      a: { label: "Days after a gratitude note", days: withNote },
      b: { label: "Days after none", days: without },
      unit: "mood_points",
      minGroupSize: 10,
      caveats: ["bidirectional"],
    });
    if (nextDay) {
      results.push({
        detectorId: this.id,
        params: { lag: 1 },
        title: "Gratitude notes and next-day mood",
        domains: this.domains,
        family: this.family,
        minSample: this.minSample,
        statementKey: `gratitude_next_day.${nextDay.direction === "positive" ? "higher" : "lower"}`,
        statementVars: { delta: Math.abs(round(nextDay.summary.meanDelta, 1)) },
        ...nextDay,
      });
    }

    return { results, hypothesesTested: 2 };
  },
};

const JOURNAL_DETECTORS = [journalDaySpend, journalLengthMood, gratitudeMood];

export default JOURNAL_DETECTORS;
