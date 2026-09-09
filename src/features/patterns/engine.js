/**
 * The pattern engine — the deterministic half of the product.
 *
 * Nothing here asks a language model anything. Signals go in, validated
 * findings come out, and the narration layer is handed finished numbers
 * it is not allowed to recompute.
 *
 * The pipeline, in order:
 *
 *   signals → coverage gate → detectors → Benjamini–Hochberg
 *           → effect floors → outlier check → confidence → ranking
 *
 * Step four is the one that matters most. A run tests forty to sixty
 * hypotheses; at p < 0.05 on pure noise that is two or three "discoveries"
 * every single time, and every one of them would read as insightful. A
 * product whose whole promise is evidence-backed self-knowledge cannot
 * ship without multiple-comparison correction, so `patterns.test.js`
 * keeps a null test as a permanent regression guard.
 */

import { endOfMonth } from "date-fns";
import { computeBudgetSummary } from "@/features/budget/summary";
import PatternRun from "@/models/PatternRun";
import { computeCoverage, getDailySignals } from "./signals";
import { leaveOneOutSwing } from "./detectors/shared";
import { DETECTORS, DETECTORS_BY_ID } from "./detectors";
import { benjaminiHochberg } from "./stats";
import { fingerprint, historyKeyOf } from "./fingerprint";
import { loadInsightHistory, persistOutcome } from "./persist";
import { addDays, dayDiff } from "./dates";
import {
  DEFAULT_WINDOW_DAYS,
  FDR_Q,
  MAX_RESULTS_PER_FAMILY,
  MIN_ACTIVE_DAYS,
  MIN_EFFECT_CLIFF,
  MIN_EFFECT_R,
  OUTLIER_DOMINANCE_RATIO,
  RANK_BOOST,
  renderStatement,
} from "./constants";
import { toDateKey } from "@/lib/utils";

/**
 * Run every eligible detector over a user's window.
 *
 * With `persist: true` the run also loads the user's stored insight
 * history (for confidence banding), upserts findings by fingerprint,
 * marks lapsed patterns stale, and logs a `PatternRun` record.
 *
 * @param {string} userId
 * @param {{from?: string, to?: string, detectorIds?: string[], history?: object, persist?: boolean, manual?: boolean}} [options]
 * @returns {Promise<{patterns: object[], skipped: object[], coverage: object, runMeta: object, persistence?: object}>}
 */
export async function runPatternEngine(userId, options = {}) {
  const startedAt = Date.now();
  const to = options.to ?? toDateKey();
  const from = options.from ?? addDays(to, -(DEFAULT_WINDOW_DAYS - 1));
  const persist = Boolean(options.persist);

  const signals = await getDailySignals(userId, from, to);
  // `options.history` is the test seam; a persisting run loads the user's
  // stored insights so confidence banding sees real track records and
  // anything they've said they already knew stops resurfacing.
  const stored = persist ? await loadInsightHistory(userId) : null;
  const ctx = {
    userId,
    from,
    to,
    history: options.history ?? stored?.history ?? {},
    suppressed: options.suppressed ?? stored?.suppressed ?? new Set(),
    ...(await budgetContext(userId, signals)),
  };

  const outcome = detectPatterns(signals, {
    ctx,
    detectorIds: options.detectorIds,
  });

  const runMeta = {
    ...outcome.runMeta,
    windowFrom: from,
    windowTo: to,
    durationMs: Date.now() - startedAt,
  };

  if (!persist) return { ...outcome, runMeta };

  try {
    const persistence = await persistOutcome(userId, outcome, { detectorIds: options.detectorIds });
    await PatternRun.create({
      userId,
      windowFrom: from,
      windowTo: to,
      detectorsRun: runMeta.detectorsRun,
      detectorsSkipped: runMeta.detectorsSkipped,
      hypotheses: runMeta.hypotheses,
      patternsFound: outcome.patterns.length,
      patternsNew: persistence.inserted,
      durationMs: runMeta.durationMs,
      manual: Boolean(options.manual),
    });
    return { ...outcome, runMeta, persistence };
  } catch (err) {
    // The run happened even if persistence failed — record it so the TTL
    // gate and debugging both see it, then let the caller know.
    await PatternRun.create({
      userId,
      windowFrom: from,
      windowTo: to,
      error: err.message,
      manual: Boolean(options.manual),
    }).catch(() => {});
    throw err;
  }
}

/**
 * The pure core: signals in, ranked findings out.
 *
 * Split from `runPatternEngine` so the whole pipeline — including the
 * null test that proves the correction works — runs without a database.
 */
export function detectPatterns(signals, { ctx = {}, detectorIds } = {}) {
  const coverage = computeCoverage(signals);
  const registry = detectorIds
    ? detectorIds.map((id) => DETECTORS_BY_ID[id]).filter(Boolean)
    : DETECTORS;

  const skipped = [];
  const candidates = [];
  let hypotheses = 0;

  // A window with almost nothing in it can still produce arithmetic. It
  // must not produce findings.
  if (coverage.activeDays < MIN_ACTIVE_DAYS) {
    return {
      patterns: [],
      skipped: registry.map((d) => ({
        detectorId: d.id,
        reason: "insufficient_activity",
        have: coverage.activeDays,
        need: MIN_ACTIVE_DAYS,
      })),
      coverage,
      runMeta: { detectorsRun: 0, detectorsSkipped: registry.length, hypotheses: 0 },
    };
  }

  for (const detector of registry) {
    // ── Coverage gate
    const shortfall = coverageShortfall(detector, coverage);
    if (shortfall) {
      skipped.push({ detectorId: detector.id, reason: "coverage", ...shortfall });
      continue;
    }

    const outcome = normaliseRun(detector.run(signals, ctx));
    hypotheses += Math.max(outcome.hypothesesTested, outcome.results.length);
    if (outcome.skipped) {
      skipped.push({ detectorId: detector.id, ...outcome.skipped });
    }
    candidates.push(...outcome.results);
  }

  // ── Benjamini–Hochberg across the whole run
  //
  // `hypotheses` counts every test performed, including the ones a
  // parameterised detector chose not to return. Correcting across only
  // the survivors would be correcting against a number we already
  // filtered on.
  const pvalues = candidates.map((c) => c.pValue);
  const padding = Math.max(hypotheses - candidates.length, 0);
  const qvalues = benjaminiHochberg([...pvalues, ...Array(padding).fill(1)]);
  candidates.forEach((c, i) => {
    c.qValue = qvalues[i];
  });

  // ── Filters
  const survivors = [];
  for (const candidate of candidates) {
    const rejection = reject(candidate, ctx);
    if (rejection) {
      skipped.push({ detectorId: candidate.detectorId, params: candidate.params, ...rejection });
      continue;
    }
    survivors.push(finalise(candidate, ctx));
  }

  const patterns = rank(capPerFamily(survivors));
  linkTwoSidedFindings(patterns);

  return {
    patterns,
    skipped,
    coverage,
    runMeta: {
      detectorsRun: registry.length - skipped.filter((s) => s.reason === "coverage").length,
      detectorsSkipped: skipped.length,
      hypotheses,
      candidates: candidates.length,
      found: patterns.length,
    },
  };
}

/** Accept a bare array or the `{ results, hypothesesTested, skipped }` form. */
function normaliseRun(returned) {
  if (Array.isArray(returned)) {
    return { results: returned, hypothesesTested: returned.length, skipped: null };
  }
  return {
    results: returned?.results ?? [],
    hypothesesTested: returned?.hypothesesTested ?? returned?.results?.length ?? 0,
    skipped: returned?.skipped ?? null,
  };
}

/** The first domain a detector needs more days of, or null if it can run. */
function coverageShortfall(detector, coverage) {
  for (const domain of detector.requires ?? []) {
    const have = coverage[domain] ?? 0;
    if (have < detector.minSample) {
      return { domain, have, need: detector.minSample };
    }
  }
  return null;
}

/**
 * Why a candidate does not reach the user, or null if it does.
 *
 * Order matters only for the reported reason — a finding has to clear
 * every one of these.
 */
function reject(candidate, ctx = {}) {
  // Suppression is checked here rather than before the detectors run, so
  // a pattern the user already knows about is still tested, still counted
  // in the correction, and still accumulates history — it just doesn't
  // reach the feed again.
  if (ctx.suppressed?.size) {
    const fp = fingerprint(candidate.detectorId, candidate.params);
    if (ctx.suppressed.has(fp)) return { reason: "suppressed_by_feedback" };
  }

  if (candidate.qValue >= FDR_Q) {
    return { reason: "not_significant", qValue: candidate.qValue, threshold: FDR_Q };
  }

  const magnitude = Math.abs(candidate.effect.standardised ?? 0);
  const floor =
    candidate.effect.type === "correlation" ? MIN_EFFECT_R : MIN_EFFECT_CLIFF;
  if (magnitude < floor) {
    return { reason: "effect_too_small", effect: magnitude, threshold: floor };
  }

  if (candidate.n < candidate.minSample) {
    return { reason: "sample_too_small", n: candidate.n, need: candidate.minSample };
  }

  // One flight, or the month's rent landing on a Tuesday, can carry an
  // entire "pattern" on its own.
  const swing = leaveOneOutSwing(candidate._loo);
  if (swing && swing.maxRelativeChange > OUTLIER_DOMINANCE_RATIO) {
    return {
      reason: "outlier_dominated",
      swing: swing.maxRelativeChange,
      threshold: OUTLIER_DOMINANCE_RATIO,
    };
  }

  return null;
}

/** Render the statement, band the confidence, and drop the working data. */
function finalise(candidate, ctx) {
  const { _loo, ...rest } = candidate;
  const history = ctx.history?.[historyKeyOf(candidate.detectorId, candidate.params)] ?? null;

  return {
    ...rest,
    statement: renderStatement(candidate.statementKey, candidate.statementVars),
    confidence: bandConfidence(candidate, history),
    windowFrom: ctx.from ?? null,
    windowTo: ctx.to ?? null,
    unstable: history ? Math.sign(history.lastEffect ?? 0) !== Math.sign(candidate.effect.standardised) : false,
  };
}

/**
 * Confidence is not the p-value — it is a band over significance, sample
 * size and, crucially, *time*.
 *
 * A pattern that looks strong on day one is still `low` until it has
 * survived re-testing across separate runs. That is what makes pattern
 * history a feature rather than a log, and it is the honest answer to
 * small-sample instability.
 *
 * @param {object} candidate
 * @param {{timesConfirmed: number, spanDays: number, effects: number[]}|null} history
 */
export function bandConfidence(candidate, history) {
  const timesConfirmed = (history?.timesConfirmed ?? 0) + 1;
  const spanDays = history?.spanDays ?? 0;
  const { qValue, n, minSample, effect } = candidate;

  if (
    qValue < 0.01 &&
    n >= minSample * 2 &&
    timesConfirmed >= 4 &&
    spanDays >= 21 &&
    effectIsStable(effect.standardised, history?.effects)
  ) {
    return "high";
  }

  if (qValue < 0.05 && n >= minSample * 1.5 && timesConfirmed >= 2) {
    return "moderate";
  }

  return "low";
}

/** Same sign every time, and magnitude within ±40% of the running mean. */
function effectIsStable(current, effects) {
  if (!effects?.length) return false;
  const all = [...effects, current];
  const signs = new Set(all.map((e) => Math.sign(e)));
  if (signs.size > 1) return false;
  const average = all.reduce((a, b) => a + Math.abs(b), 0) / all.length;
  return all.every((e) => Math.abs(Math.abs(e) - average) <= average * 0.4);
}

/** No family may flood the feed (§4.0). */
function capPerFamily(patterns) {
  const counts = new Map();
  const sorted = [...patterns].sort(
    (a, b) => Math.abs(b.effect.standardised) - Math.abs(a.effect.standardised)
  );
  const kept = [];
  for (const pattern of sorted) {
    const used = counts.get(pattern.family) ?? 0;
    if (used >= MAX_RESULTS_PER_FAMILY) continue;
    counts.set(pattern.family, used + 1);
    kept.push(pattern);
  }
  return kept;
}

/**
 * Rank by strength × recency × novelty.
 *
 * Novelty demotes anything the user has already seen or has told us they
 * already knew — the "already knew" signal is the strongest one there is
 * about what this person finds worth reading.
 */
export function rank(patterns) {
  return [...patterns]
    .map((pattern) => {
      const strength = Math.abs(pattern.effect.standardised ?? 0);
      const certainty = 1 - Math.min(pattern.qValue / FDR_Q, 1) * 0.4;
      const boost = RANK_BOOST[pattern.detectorId] ?? 1;
      const confidenceWeight = { low: 0.85, moderate: 1, high: 1.15 }[pattern.confidence] ?? 1;
      const novelty = pattern.unstable ? 0.5 : 1;

      return {
        ...pattern,
        rankScore: strength * certainty * boost * confidenceWeight * novelty,
      };
    })
    .sort((a, b) => b.rankScore - a.rankScore);
}

/**
 * A2 and A3 describe two directions of the same loop. When both survive,
 * present them as one two-sided finding — a feedback loop is both more
 * interesting and more honest than two half-findings pointing at each
 * other.
 */
function linkTwoSidedFindings(patterns) {
  const forward = patterns.find((p) => p.detectorId === "mood_next_day_spend");
  const backward = patterns.find((p) => p.detectorId === "spend_then_mood");
  if (forward && backward) {
    forward.linkedWith = backward.detectorId;
    backward.linkedWith = forward.detectorId;
  }
}

/**
 * The monthly budget limits the window covers, and which of those months
 * the window covers in full.
 *
 * `computeBudgetSummary` owns the carry-forward rules — a budget set in
 * March still applies in April unless replaced — so this asks it once per
 * month rather than reimplementing them.
 */
async function budgetContext(userId, signals) {
  if (!signals.length) return { monthlyBudgets: {}, fullMonths: [] };

  const months = [...new Set(signals.map((s) => s.date.slice(0, 7)))];
  const monthlyBudgets = {};

  await Promise.all(
    months.map(async (month) => {
      try {
        const summary = await computeBudgetSummary(userId, "monthly", {
          date: new Date(`${month}-01T12:00:00`),
          // The window is bucketed by Gregorian month here, so the
          // budget has to be read in the same calendar.
          cal: "en",
        });
        monthlyBudgets[month] = summary.totalBudgetPaisa || 0;
      } catch {
        monthlyBudgets[month] = 0;
      }
    })
  );

  // A month is only usable if the window saw it from the 1st to its end,
  // because anything else has no true month-to-date figure.
  const first = signals[0].date;
  const last = signals[signals.length - 1].date;
  const fullMonths = months.filter((month) => {
    const monthStart = `${month}-01`;
    const monthEnd = toDateKey(endOfMonth(new Date(`${monthStart}T12:00:00`)));
    return dayDiff(first, monthStart) >= 0 && dayDiff(monthEnd, last) >= 0;
  });

  return { monthlyBudgets, fullMonths };
}
