/**
 * Persistence — where patterns become durable objects with identity and
 * history.
 *
 * The decision logic (`buildHistoryMap`, `planPersistence`, `gateRun`) is
 * pure and takes plain objects, so every rule — upsert-by-fingerprint,
 * stale marking, dismissed-stays-dismissed, the TTL gate — is testable
 * without a database. The exported `loadInsightHistory` / `persistOutcome`
 * are thin shells that fetch, call the planner, and execute its plan.
 *
 * The rules that matter (§5.2 of the blueprint):
 *
 *   - New fingerprint            → insert, timesConfirmed = 1, low confidence
 *   - Existing, still significant → append strengthHistory, timesConfirmed += 1
 *   - Existing, no longer found   → status 'stale', document and history kept
 *   - Dismissed / archived        → sticky; stats update, status does not
 *
 * Nothing is ever hard-deleted.
 */

import connectDB from "@/lib/mongoose";
import Insight from "@/models/Insight";
import { DETECTORS } from "./detectors";
import { fingerprint, historyKeyOf } from "./fingerprint";
import { MAX_MANUAL_RUNS_PER_DAY, RUN_TTL_HOURS } from "./constants";

const DAY_MS = 86_400_000;

// ── Pure planning ──────────────────────────────────────────────────────

/**
 * Build the engine's `ctx.history` from stored insights: for each known
 * pattern, how often it has confirmed, over what span, and what its
 * effect has been — the inputs to confidence banding and sign-flip
 * detection.
 *
 * @param {object[]} insights  lean Insight documents
 * @param {Date} [now]
 */
export function buildHistoryMap(insights, now = new Date()) {
  const history = {};
  for (const doc of insights ?? []) {
    const effects = (doc.strengthHistory ?? [])
      .map((h) => h?.value)
      .filter((v) => Number.isFinite(v));
    history[historyKeyOf(doc.detectorId, doc.params)] = {
      timesConfirmed: doc.timesConfirmed ?? 0,
      spanDays: doc.firstDetectedAt
        ? Math.max(0, Math.floor((now.getTime() - new Date(doc.firstDetectedAt).getTime()) / DAY_MS))
        : 0,
      effects,
      lastEffect: effects.length ? effects[effects.length - 1] : null,
    };
  }
  return history;
}

/**
 * Fingerprints the user has told us, one way or another, to stop
 * surfacing.
 *
 * "I already knew this" is the single most informative thing a user can
 * say about a finding: the pattern is real and they do not need to be
 * told again. Dismissing the same insight twice says the same thing more
 * quietly. Either way the pattern keeps being tested and keeps its
 * history — it just stops competing for attention.
 *
 * @returns {Set<string>} fingerprints
 */
export function buildSuppressionSet(insights) {
  const suppressed = new Set();
  for (const doc of insights ?? []) {
    if (doc.feedback?.rating === "knew_it") suppressed.add(doc.fingerprint);
    if ((doc.dismissCount ?? 0) >= 2) suppressed.add(doc.fingerprint);
  }
  return suppressed;
}

/**
 * Decide what a run's findings do to the stored insight set. Returns a
 * plan of inserts, updates and stale-markings; executing it is separate
 * so the decisions stay pure.
 *
 * @param {object} args
 * @param {string} args.userId
 * @param {object[]} args.patterns        finalised patterns from this run
 * @param {object[]} args.existing        the user's stored insights
 * @param {Set<string>} args.ranDetectorIds  detectors that actually ran —
 *        insights from detectors that didn't run (coverage-gated) are
 *        left alone: no data is not the same as no pattern.
 * @param {Date} [args.now]
 * @returns {{inserts: object[], updates: object[], staleIds: string[]}}
 */
export function planPersistence({ userId, patterns, existing, ranDetectorIds, now = new Date() }) {
  const byFingerprint = new Map((existing ?? []).map((doc) => [doc.fingerprint, doc]));

  const inserts = [];
  const updates = [];
  const foundFingerprints = new Set();

  for (const pattern of patterns ?? []) {
    const fp = fingerprint(pattern.detectorId, pattern.params);
    // The same detector+params twice in one run would be one finding —
    // keep the first and move on.
    if (foundFingerprints.has(fp)) continue;
    foundFingerprints.add(fp);

    const historyEntry = {
      date: now,
      value: pattern.effect?.standardised ?? null,
      n: pattern.n,
      qValue: pattern.qValue,
      confidence: pattern.confidence,
    };

    const stored = byFingerprint.get(fp);
    if (!stored) {
      inserts.push({
        userId,
        detectorId: pattern.detectorId,
        params: pattern.params ?? {},
        fingerprint: fp,
        statementKey: pattern.statementKey,
        statementVars: pattern.statementVars ?? {},
        title: pattern.title,
        domains: pattern.domains ?? [],
        family: pattern.family,
        effect: pattern.effect,
        direction: pattern.direction,
        n: pattern.n,
        pValue: pattern.pValue,
        qValue: pattern.qValue,
        confidence: pattern.confidence,
        evidence: pattern.evidence ?? {},
        windowFrom: pattern.windowFrom ?? null,
        windowTo: pattern.windowTo ?? null,
        unstable: Boolean(pattern.unstable),
        status: "active",
        firstDetectedAt: now,
        lastConfirmedAt: now,
        timesConfirmed: 1,
        strengthHistory: [historyEntry],
      });
      continue;
    }

    // Reconfirmed. Refresh every computed field and extend the history.
    const set = {
      statementKey: pattern.statementKey,
      statementVars: pattern.statementVars ?? {},
      title: pattern.title,
      domains: pattern.domains ?? [],
      family: pattern.family,
      effect: pattern.effect,
      direction: pattern.direction,
      n: pattern.n,
      pValue: pattern.pValue,
      qValue: pattern.qValue,
      confidence: pattern.confidence,
      evidence: pattern.evidence ?? {},
      windowFrom: pattern.windowFrom ?? null,
      windowTo: pattern.windowTo ?? null,
      unstable: Boolean(pattern.unstable),
      lastConfirmedAt: now,
    };
    // The user said they don't want to see this — that decision stands
    // even though the pattern still holds. Stats update regardless.
    if (stored.status === "active" || stored.status === "stale") {
      set.status = "active";
    }
    updates.push({ id: stored._id, set, historyEntry });
  }

  // Active insights whose detector ran this time but which did not
  // survive the run are stale — "no longer significant", with the whole
  // history retained. Detectors that were coverage-gated never ran, so
  // their insights are neither confirmed nor staled.
  const staleIds = (existing ?? [])
    .filter(
      (doc) =>
        doc.status === "active" &&
        ranDetectorIds.has(doc.detectorId) &&
        !foundFingerprints.has(doc.fingerprint)
    )
    .map((doc) => doc._id);

  return { inserts, updates, staleIds };
}

/**
 * Which of this run's detectors actually executed — i.e. were not skipped
 * by the activity or coverage gates. A detector that ran and found
 * nothing says something; one that never ran says nothing.
 */
export function ranDetectorIds(outcome, detectorIds) {
  const registryIds = new Set(
    (detectorIds?.length ? detectorIds : DETECTORS.map((d) => d.id))
  );
  for (const skip of outcome.skipped ?? []) {
    if (skip.reason === "coverage" || skip.reason === "insufficient_activity") {
      // Parameterised skips carry the detector id too — but a detector
      // with a per-parameter skip may still have run for other params.
      // Coverage/activity skips are detector-level, so this is safe.
      registryIds.delete(skip.detectorId);
    }
  }
  return registryIds;
}

/**
 * The run gate (§5.5). Runs are expensive and narration will make them
 * more so, so Discoveries serves stored insights inside the TTL and only
 * recomputes when they're old — while always allowing a bounded number of
 * manual "check for new patterns" runs per day.
 *
 * @returns {{allowed: boolean, reason: 'ok'|'fresh'|'rate_limited', nextEligibleAt?: Date}}
 */
export function gateRun({ lastRunAt = null, manualRunsToday = 0, force = false, now = new Date() }) {
  if (force) {
    if (manualRunsToday >= MAX_MANUAL_RUNS_PER_DAY) {
      return { allowed: false, reason: "rate_limited" };
    }
    return { allowed: true, reason: "ok" };
  }
  if (lastRunAt) {
    const freshUntil = new Date(new Date(lastRunAt).getTime() + RUN_TTL_HOURS * 3_600_000);
    if (now < freshUntil) {
      return { allowed: false, reason: "fresh", nextEligibleAt: freshUntil };
    }
  }
  return { allowed: true, reason: "ok" };
}

// ── Thin DB shell ──────────────────────────────────────────────────────

/**
 * The engine's `ctx.history` and `ctx.suppressed`, loaded from the user's
 * stored insights in one read.
 */
export async function loadInsightHistory(userId) {
  await connectDB();
  const docs = await Insight.find({ userId })
    .select(
      "detectorId params fingerprint timesConfirmed firstDetectedAt strengthHistory feedback dismissCount"
    )
    .lean();
  return {
    history: buildHistoryMap(docs),
    suppressed: buildSuppressionSet(docs),
  };
}

/**
 * Apply a run's outcome to the stored insight set: upsert by fingerprint,
 * mark lapsed patterns stale, and report what changed.
 *
 * @returns {Promise<{inserted: number, updated: number, staled: number}>}
 */
export async function persistOutcome(userId, outcome, { detectorIds, now = new Date() } = {}) {
  await connectDB();
  const existing = await Insight.find({ userId }).lean();
  const plan = planPersistence({
    userId,
    patterns: outcome.patterns,
    existing,
    ranDetectorIds: ranDetectorIds(outcome, detectorIds),
    now,
  });

  let inserted = 0;
  if (plan.inserts.length) {
    try {
      const docs = await Insight.insertMany(plan.inserts, { ordered: false });
      inserted = docs.length;
    } catch (err) {
      // A concurrent run may have inserted the same fingerprint between
      // our read and write. Fold those into updates rather than failing
      // the run; any other error still throws.
      const isDupesOnly =
        err?.name === "MongoBulkWriteError" &&
        err.writeErrors?.every((e) => e.code === 11000);
      if (!isDupesOnly) throw err;
      for (const writeError of err.writeErrors) {
        const doc = plan.inserts[writeError.index];
        if (!doc) continue;
        await Insight.updateOne(
          { userId, fingerprint: doc.fingerprint },
          { $set: { lastConfirmedAt: now } }
        );
      }
      inserted = plan.inserts.length - err.writeErrors.length;
    }
  }

  if (plan.updates.length) {
    await Insight.bulkWrite(
      plan.updates.map((update) => ({
        updateOne: {
          filter: { _id: update.id, userId },
          update: {
            $set: update.set,
            $push: { strengthHistory: update.historyEntry },
            $inc: { timesConfirmed: 1 },
          },
        },
      }))
    );
  }

  if (plan.staleIds.length) {
    await Insight.updateMany(
      { _id: { $in: plan.staleIds }, userId },
      { $set: { status: "stale" } }
    );
  }

  return { inserted, updated: plan.updates.length, staled: plan.staleIds.length };
}
