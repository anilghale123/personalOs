import { withRoute, json } from "@/lib/api";
import { z } from "@/lib/validation";
import Insight from "@/models/Insight";
import PatternRun from "@/models/PatternRun";
import { renderStatement, RUN_TTL_HOURS } from "@/features/patterns/constants";

const STATUSES = ["active", "stale", "dismissed", "archived", "all"];
const CONFIDENCE_ORDER = { high: 0, moderate: 1, low: 2 };

/**
 * GET /api/patterns/insights?status=active
 *
 * The Discoveries feed: the user's stored insights, best first. Read time
 * is when the statement is re-rendered from `statementKey` + vars, so a
 * template improvement reaches old insights too — the stored document
 * never needs a migration for wording.
 */
export const GET = withRoute(
  {
    limit: "read",
    query: z.object({ status: z.enum(STATUSES).catch("active") }),
  },
  async ({ userId, query }) => {
  const status = query.status;

  const [docs, lastRun, dismissedCount] = await Promise.all([
    Insight.find({
      userId,
      ...(status === "all" ? {} : { status }),
    })
      /**
       * Bounded. Insights are capped per family per run so this is in the
       * dozens today, but an unbounded find that is then sorted in memory
       * has no ceiling at all as history accumulates.
       */
      .sort({ lastConfirmedAt: -1 })
      .limit(200)
      .lean(),
    PatternRun.findOne({ userId, error: null }).sort({ runAt: -1 }).lean(),
    Insight.countDocuments({ userId, status: "dismissed" }),
  ]);

  const insights = docs
    .map(toFeedItem)
    .sort(
      (a, b) =>
        CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence] ||
        new Date(b.lastConfirmedAt) - new Date(a.lastConfirmedAt)
    );

  const lastRunAt = lastRun?.runAt ?? null;
  return json({
    insights,
    meta: {
      lastRunAt,
      nextRunAt: lastRunAt
        ? new Date(new Date(lastRunAt).getTime() + RUN_TTL_HOURS * 3_600_000).toISOString()
        : null,
      dismissedAvailable: dismissedCount,
    },
  });
  }
);

/** The feed shape: everything a card needs, nothing the DB added. */
function toFeedItem(doc) {
  return {
    id: String(doc._id),
    detectorId: doc.detectorId,
    family: doc.family,
    title: doc.title,
    statement: renderStatement(doc.statementKey, doc.statementVars),
    domains: doc.domains,
    status: doc.status,
    effect: doc.effect,
    direction: doc.direction,
    n: doc.n,
    pValue: doc.pValue,
    qValue: doc.qValue,
    confidence: doc.confidence,
    evidence: doc.evidence,
    windowFrom: doc.windowFrom,
    windowTo: doc.windowTo,
    timesConfirmed: doc.timesConfirmed,
    strengthHistory: doc.strengthHistory,
    unstable: doc.unstable,
    firstDetectedAt: doc.firstDetectedAt,
    lastConfirmedAt: doc.lastConfirmedAt,
    feedback: doc.feedback ?? null,
    readAt: doc.readAt,
    narration: doc.narration ?? null,
  };
}
