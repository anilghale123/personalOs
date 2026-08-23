/**
 * Sentiment variants — the same questions as Families A and C, asked of
 * what the user *wrote* rather than what they remembered to tap.
 *
 * Mood is optional and nullable, and roughly half the detector set needs
 * around twenty-four mood-days before it will run at all. Sentiment comes
 * from journalling the user was going to do anyway, so it reaches
 * coverage on a different schedule and rescues the days where no mood was
 * ever set.
 *
 * These are genuinely separate hypotheses from their mood counterparts,
 * not restatements: the two signals disagree often enough to be worth
 * testing apart, and both are counted in the run's correction either way.
 */

import { laggedPairs, pairwise } from "../stats";
import { compareGroups, correlate } from "./shared";

/** Sentiment below this reads as a difficult day; above it, an easy one. */
const LOW_SENTIMENT = -0.2;
const HIGH_SENTIMENT = 0.2;

/** A1′ — discretionary spending on days you wrote about negatively. */
export const sentimentWantSpend = {
  id: "sentiment_want_spend",
  title: "Written tone and discretionary spending",
  domains: ["journal", "money"],
  family: "sentiment",
  requires: ["sentiment", "money"],
  minSample: 24,

  run(signals) {
    const written = signals.filter((s) => s.hasSentiment && s.hasMoneyData);
    const toDay = (s) => ({ date: s.date, value: s.spendWantPaisa });

    const stat = compareGroups({
      a: {
        label: "Days you wrote in a low tone",
        days: written.filter((s) => s.sentiment <= LOW_SENTIMENT).map(toDay),
      },
      b: {
        label: "Days you wrote in a high tone",
        days: written.filter((s) => s.sentiment >= HIGH_SENTIMENT).map(toDay),
      },
      unit: "paisa",
      caveats: ["selective_logging"],
    });
    if (!stat) {
      return { results: [], skipped: { reason: "sentiment_groups", have: written.length } };
    }

    return [
      {
        detectorId: this.id,
        params: {},
        title: this.title,
        domains: this.domains,
        family: this.family,
        minSample: this.minSample,
        statementKey: `sentiment_want_spend.${stat.direction === "positive" ? "higher" : "lower"}`,
        statementVars: {
          lowMoodPaisa: stat.summary.aMedian,
          highMoodPaisa: stat.summary.bMedian,
        },
        ...stat,
      },
    ];
  },
};

/** C1′ — habit completion against the tone of that day's writing. */
export const sentimentHabitRate = {
  id: "sentiment_habit_rate",
  title: "Habits and written tone",
  domains: ["habits", "journal"],
  family: "sentiment",
  requires: ["sentiment", "habits"],
  minSample: 24,

  run(signals) {
    const { xs, ys, dates } = pairwise(signals, "habitRate", "sentiment");

    const stat = correlate({
      xs,
      ys,
      dates,
      xLabel: "Habit completion rate",
      yLabel: "Written tone",
      minPairs: this.minSample,
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
        statementKey: `sentiment_habit_rate.${stat.direction}`,
        statementVars: { n: stat.n },
        ...stat,
      },
    ];
  },
};

/** A3′ — today's discretionary spending against tomorrow's written tone. */
export const spendThenSentiment = {
  id: "spend_then_sentiment",
  title: "Spending today, written tone tomorrow",
  domains: ["money", "journal"],
  family: "sentiment",
  requires: ["sentiment", "money"],
  minSample: 21,

  run(signals) {
    const rows = signals.map((s) => ({
      date: s.date,
      x: s.hasMoneyData ? s.spendWantManualPaisa : null,
      y: s.hasSentiment ? s.sentiment : null,
    }));

    const { xs, ys, dates, possible } = laggedPairs(rows, "x", "y", 1);
    if (possible > 0 && 1 - xs.length / possible > 0.3) {
      return { results: [], skipped: { reason: "pair_gap_rate", gapRate: 1 - xs.length / possible } };
    }

    const stat = correlate({
      xs,
      ys,
      dates,
      xLabel: "Want spend (day d)",
      yLabel: "Written tone (day d+1)",
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
        statementKey: `spend_then_sentiment.${stat.direction}`,
        statementVars: { n: stat.n },
        ...stat,
      },
    ];
  },
};

const SENTIMENT_DETECTORS = [sentimentWantSpend, sentimentHabitRate, spendThenSentiment];

export default SENTIMENT_DETECTORS;
