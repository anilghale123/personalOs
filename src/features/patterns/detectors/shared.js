/**
 * The statistical machinery every detector shares.
 *
 * Detectors are responsible for deciding *what* to compare and for
 * choosing the sentence; everything about *how* the comparison is tested,
 * how the effect is measured and what evidence is kept lives here, so all
 * eighteen of them are held to the same standard.
 */

import {
  cliffsDelta,
  correlationTest,
  fisherCI,
  mannWhitneyU,
  mean,
  median,
  permutationPCorrelation,
  permutationPGroups,
  quantile,
  spearman,
  welchTTest,
} from "../stats";
import {
  EVIDENCE_MAX_POINTS,
  EVIDENCE_MAX_TOP_DAYS,
  MIN_GROUP_SIZE,
  MIN_PAIRS_CORRELATION,
} from "../constants";

/**
 * Compare two groups of days.
 *
 * Significance comes from Mann–Whitney U and the effect size from Cliff's
 * delta — both rank-based, so neither can be manufactured by a single
 * enormous value. Welch's t-test is computed alongside for *reporting*
 * the difference in means, never for deciding anything.
 *
 * @param {{label: string, days: {date: string, value: number}[]}} a
 * @param {{label: string, days: {date: string, value: number}[]}} b
 * @returns {object|null} null when either group is too small to test
 */
export function compareGroups({
  a,
  b,
  unit,
  minGroupSize = MIN_GROUP_SIZE,
  caveats = [],
}) {
  const aValues = a.days.map((d) => d.value);
  const bValues = b.days.map((d) => d.value);
  if (aValues.length < minGroupSize || bValues.length < minGroupSize) return null;

  const test = mannWhitneyU(aValues, bValues);
  const delta = cliffsDelta(aValues, bValues);
  if (!test || delta === null) return null;

  const aMedian = median(aValues);
  const bMedian = median(bValues);
  const aMean = mean(aValues);
  const bMean = mean(bValues);
  const welch = welchTTest(aValues, bValues);

  return {
    n: aValues.length + bValues.length,
    // Permutation, not the normal approximation — see permutationPGroups.
    // The approximation is kept in `summary` for reporting.
    pValue: permutationPGroups(aValues, bValues),
    direction: aMedian >= bMedian ? "positive" : "negative",
    effect: {
      type: "group_difference",
      value: aMedian - bMedian,
      unit,
      standardised: delta,
    },
    summary: {
      aMedian,
      bMedian,
      aMean,
      bMean,
      meanDelta: aMean - bMean,
      mannWhitneyP: test.p,
    },
    evidence: {
      kind: "two_group",
      groups: {
        a: { label: a.label, n: aValues.length, mean: aMean, median: aMedian },
        b: { label: b.label, n: bValues.length, mean: bMean, median: bMedian },
      },
      points: groupPoints(a, b),
      topDays: extremeDays(a, b),
      welch: welch ? { t: welch.t, df: welch.df } : null,
      caveats,
    },
    // Stripped by the engine after the leave-one-out check — never stored.
    _loo: { kind: "two_group", a: aValues, b: bValues },
  };
}

/**
 * Correlate two values across days, by rank.
 *
 * @param {number[]} xs
 * @param {number[]} ys
 * @param {string[]} dates
 * @returns {object|null} null below the minimum pair count
 */
export function correlate({
  xs,
  ys,
  dates,
  xLabel,
  yLabel,
  minPairs = MIN_PAIRS_CORRELATION,
  caveats = [],
}) {
  if (xs.length < minPairs) return null;

  const rho = spearman(xs, ys);
  if (rho === null) return null;

  const test = correlationTest(rho, xs.length);
  if (!test) return null;

  return {
    n: xs.length,
    // The t transform behind `correlationTest` assumes continuous data;
    // mood is a five-point scale. Permuting the pairing instead.
    pValue: permutationPCorrelation(xs, ys),
    direction: rho >= 0 ? "positive" : "negative",
    effect: {
      type: "correlation",
      value: rho,
      unit: "rho",
      standardised: rho,
    },
    summary: { rho, ci: fisherCI(rho, xs.length), parametricP: test.p },
    evidence: {
      kind: "correlation",
      xLabel,
      yLabel,
      points: capPoints(
        dates.map((date, i) => ({ date, x: xs[i], y: ys[i] }))
      ),
      topDays: correlationExtremes(dates, xs, ys),
      caveats,
    },
    _loo: { kind: "correlation", xs, ys },
  };
}

/**
 * Re-run the effect with each day left out in turn, and report the
 * largest relative swing.
 *
 * A "pattern" that collapses when one day is removed is that one day
 * wearing a trenchcoat — a single flight, or the month rent landed on a
 * Tuesday. The engine suppresses those.
 *
 * @returns {{maxRelativeChange: number, worstIndex: number}|null}
 */
export function leaveOneOutSwing(loo) {
  if (!loo) return null;

  if (loo.kind === "correlation") {
    const base = spearman(loo.xs, loo.ys);
    if (!base) return null;
    return worstSwing(base, loo.xs.length, (i) =>
      spearman(without(loo.xs, i), without(loo.ys, i))
    );
  }

  if (loo.kind === "two_group") {
    const base = cliffsDelta(loo.a, loo.b);
    if (!base) return null;
    const n = loo.a.length + loo.b.length;
    return worstSwing(base, n, (i) =>
      i < loo.a.length
        ? cliffsDelta(without(loo.a, i), loo.b)
        : cliffsDelta(loo.a, without(loo.b, i - loo.a.length))
    );
  }

  return null;
}

function worstSwing(base, n, recompute) {
  let maxRelativeChange = 0;
  let worstIndex = -1;
  for (let i = 0; i < n; i++) {
    const value = recompute(i);
    if (value === null) continue;
    const change = Math.abs(base - value) / Math.abs(base);
    if (change > maxRelativeChange) {
      maxRelativeChange = change;
      worstIndex = i;
    }
  }
  return { maxRelativeChange, worstIndex };
}

function without(xs, i) {
  return xs.slice(0, i).concat(xs.slice(i + 1));
}

/** Days as evidence points, tagged by group, capped for storage. */
function groupPoints(a, b) {
  const points = [
    ...a.days.map((d) => ({ date: d.date, group: "a", value: d.value })),
    ...b.days.map((d) => ({ date: d.date, group: "b", value: d.value })),
  ].sort((x, y) => x.date.localeCompare(y.date));
  return capPoints(points);
}

/**
 * The most extreme contributing days from each side — the rows the detail
 * page links back to the user's own journal and expense list.
 *
 * Outliers are deliberately included rather than trimmed. Hiding them to
 * make the evidence look tidy is the visual version of the statistical
 * dishonesty the FDR correction exists to prevent.
 */
function extremeDays(a, b) {
  const half = Math.floor(EVIDENCE_MAX_TOP_DAYS / 2);
  const rank = (days) => [...days].sort((x, y) => y.value - x.value);
  return [
    ...rank(a.days).slice(0, half).map((d) => ({ ...d, group: "a", label: a.label })),
    ...rank(b.days).slice(0, half).map((d) => ({ ...d, group: "b", label: b.label })),
  ];
}

/** The days at both ends of the x range, where a correlation is decided. */
function correlationExtremes(dates, xs, ys) {
  const rows = dates.map((date, i) => ({ date, x: xs[i], y: ys[i] }));
  rows.sort((p, q) => p.x - q.x);
  const half = Math.floor(EVIDENCE_MAX_TOP_DAYS / 2);
  return [...rows.slice(0, half), ...rows.slice(-half)];
}

/** Even sampling down to the storage cap, keeping both ends of the range. */
function capPoints(points) {
  if (points.length <= EVIDENCE_MAX_POINTS) return points;
  const step = points.length / EVIDENCE_MAX_POINTS;
  const out = [];
  for (let i = 0; i < EVIDENCE_MAX_POINTS; i++) {
    out.push(points[Math.floor(i * step)]);
  }
  return out;
}

/** Days where a field is present, as `{date, value}` rows. */
export function daysWith(signals, key, predicate = () => true) {
  const out = [];
  for (const s of signals) {
    const value = s[key];
    if (value === null || value === undefined) continue;
    if (!predicate(s)) continue;
    out.push({ date: s.date, value: Number(value) });
  }
  return out;
}

/** Split days into two labelled groups by a predicate on the signal row. */
export function splitDays(signals, valueKey, predicate, labels) {
  const a = [];
  const b = [];
  for (const s of signals) {
    const value = s[valueKey];
    if (value === null || value === undefined) continue;
    const side = predicate(s);
    if (side === null || side === undefined) continue;
    (side ? a : b).push({ date: s.date, value: Number(value) });
  }
  return { a: { label: labels[0], days: a }, b: { label: labels[1], days: b } };
}

/** The user's own P90 for a field — "unusually large" means large for them. */
export function ownQuantile(signals, key, q, predicate = () => true) {
  const values = signals
    .filter((s) => predicate(s) && s[key] !== null && s[key] !== undefined)
    .map((s) => Number(s[key]));
  return quantile(values, q);
}

/** Round to a fixed number of places for display in a statement. */
export function round(value, places = 1) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
