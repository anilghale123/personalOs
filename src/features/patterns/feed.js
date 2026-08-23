/**
 * Read-time ranking for the Discoveries feed.
 *
 * The engine ranks findings at detection time, but that score can't be
 * stored and left alone: it has to keep changing as the *user* reacts.
 * An insight that has been read, or that the user has told us they
 * already knew, should sink — and neither of those facts existed when the
 * run happened. So ranking is recomputed on every read from fields the
 * `Insight` document already carries.
 *
 * Pure: plain feed items in, ordered feed items out. No DB, no React.
 */

import { FDR_Q, RANK_BOOST } from "./constants";

const DAY_MS = 86_400_000;

/** How much each confidence band is worth in the ordering. */
const CONFIDENCE_WEIGHT = { low: 0.85, moderate: 1, high: 1.15 };

/**
 * What the user's own reaction does to an insight's standing.
 *
 * "I already knew this" is the strongest signal in the product about what
 * this person finds worth reading, so it demotes hardest — the pattern
 * stays tracked and stays in the archive, it just stops competing for the
 * headline.
 */
const FEEDBACK_WEIGHT = {
  useful: 1.15,
  not_useful: 0.4,
  knew_it: 0.2,
};

/** A lapsed pattern belongs in the archive, never at the top of the feed. */
const STATUS_WEIGHT = { active: 1, stale: 0.3, dismissed: 0.1, archived: 0.1 };

/**
 * Ranking score for one insight — strength × certainty × recency ×
 * novelty, with the per-detector weighting that keeps forward-looking
 * findings above the merely obvious.
 */
export function scoreInsight(insight, now = new Date()) {
  const strength = Math.abs(insight?.effect?.standardised ?? 0);
  const certainty = 1 - Math.min((insight?.qValue ?? FDR_Q) / FDR_Q, 1) * 0.4;
  const boost = RANK_BOOST[insight?.detectorId] ?? 1;
  const confidence = CONFIDENCE_WEIGHT[insight?.confidence] ?? 1;
  const status = STATUS_WEIGHT[insight?.status] ?? 1;
  const feedback = FEEDBACK_WEIGHT[insight?.feedback?.rating] ?? 1;
  // Seen already? Still worth showing, just not first.
  const unread = insight?.readAt ? 0.75 : 1;
  const stability = insight?.unstable ? 0.5 : 1;

  return (
    strength *
    certainty *
    boost *
    confidence *
    status *
    feedback *
    unread *
    stability *
    recencyWeight(insight?.lastConfirmedAt, now)
  );
}

/**
 * Decays from 1 to 0.6 over a month. Gentle on purpose: a pattern
 * confirmed three weeks ago is not less true than one confirmed
 * yesterday, it is just less immediate.
 */
function recencyWeight(lastConfirmedAt, now) {
  if (!lastConfirmedAt) return 0.8;
  const days = Math.max(0, (now.getTime() - new Date(lastConfirmedAt).getTime()) / DAY_MS);
  return Math.max(0.6, 1 - (days / 30) * 0.4);
}

/** The same insights, best first, each carrying its `rankScore`. */
export function rankFeed(insights, { now = new Date() } = {}) {
  return (insights ?? [])
    .map((insight) => ({ ...insight, rankScore: scoreInsight(insight, now) }))
    .sort((a, b) => b.rankScore - a.rankScore);
}

/**
 * Split a ranked feed into the one headline slot and the rest.
 *
 * The headline is the top-ranked **unread** insight — a wall of nine
 * discoveries is dashboard fatigue wearing a new hat, and showing the
 * same one at the top forever is worse. When everything has been read,
 * the strongest simply leads again.
 *
 * @returns {{headline: object|null, rest: object[]}}
 */
export function splitFeed(insights, { now = new Date(), limit = 4 } = {}) {
  const ranked = rankFeed(insights, { now }).filter((i) => i.status === "active");
  if (!ranked.length) return { headline: null, rest: [] };

  const headline = ranked.find((i) => !i.readAt) ?? ranked[0];
  const rest = ranked.filter((i) => i !== headline).slice(0, limit);
  return { headline, rest };
}

/** Whole weeks since a date — the unit confidence is spoken in. */
export function weeksSince(date, now = new Date()) {
  if (!date) return 0;
  const days = (now.getTime() - new Date(date).getTime()) / DAY_MS;
  return Math.max(0, Math.floor(days / 7));
}

/**
 * The plain-language confidence line (§6.6). Never a p-value, never an
 * effect size — those live behind a disclosure on the detail page.
 */
export function confidenceLabel(insight, now = new Date()) {
  const weeks = weeksSince(insight?.firstDetectedAt, now);
  if (insight?.confidence === "high") return "Strong, stable pattern";
  if (insight?.confidence === "moderate") {
    return weeks >= 1
      ? `Seen consistently over ${weeks} ${weeks === 1 ? "week" : "weeks"}`
      : "Seen consistently across several checks";
  }
  return "Early signal — worth watching";
}

/** Filled/empty dot count for the confidence pill. */
export function confidenceDots(confidence) {
  return { low: 1, moderate: 2, high: 3 }[confidence] ?? 1;
}
