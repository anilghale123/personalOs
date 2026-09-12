import { withRoute, json, must } from "@/lib/api";
import { z, optionalText } from "@/lib/validation";
import { invalidate, tags } from "@/lib/cache";
import Insight from "@/models/Insight";
import { renderStatement } from "@/features/patterns/constants";

const RATINGS = ["useful", "not_useful", "knew_it"];

/**
 * GET /api/patterns/insights/[id]
 * One insight, full detail — the "why is this true" view.
 */
export const GET = withRoute(
  { limit: "read", params: ["id"] },
  async ({ userId, params }) => {
    const doc = must(await Insight.findOne({ _id: params.id, userId }).lean());

    return json({
      ...doc,
      id: String(doc._id),
      // Re-rendered at read time so a template fix reaches old insights too.
      statement: renderStatement(doc.statementKey, doc.statementVars),
    });
  }
);

const UpdateInsight = z
  .object({
    action: z.enum(["dismiss", "undismiss"]).optional(),
    rating: z.enum(RATINGS).optional(),
    note: optionalText(1000),
    read: z.literal(true).optional(),
  })
  .refine(
    (v) => v.action !== undefined || v.rating !== undefined || v.read === true,
    { message: "Nothing to update." }
  );

/**
 * PATCH /api/patterns/insights/[id]
 *
 * Body: { action: 'dismiss' }          — hide it; the pattern keeps being
 *                                        tracked, it just stops showing.
 *       { action: 'undismiss' }        — welcome it back (goes stale so a
 *                                        confirming run reactivates it).
 *       { rating, note? }              — per-pattern feedback.
 *       { read: true }                 — mark the card as seen.
 *
 * Dismissal is sticky by design: `planPersistence` refreshes a dismissed
 * insight's stats but never its status, so a rediscovery can't resurrect
 * something the user asked not to see.
 */
export const PATCH = withRoute(
  { limit: "write", params: ["id"], body: UpdateInsight },
  async ({ userId, params, input }) => {
    const update = {};

    if (input.action !== undefined) {
      update.status = input.action === "dismiss" ? "dismissed" : "stale";
    }
    if (input.rating !== undefined) {
      update.feedback = {
        rating: input.rating,
        note: input.note,
        at: new Date(),
      };
    }
    if (input.read === true) update.readAt = new Date();

    const doc = must(
      await Insight.findOneAndUpdate(
        { _id: params.id, userId },
        {
          $set: update,
          // Counted so a second dismissal suppresses the pattern in future
          // runs — see buildSuppressionSet in persist.js.
          ...(input.action === "dismiss" ? { $inc: { dismissCount: 1 } } : {}),
        },
        { new: true, runValidators: true }
      ).lean()
    );

    invalidate(tags.insights(userId));

    return json({ ok: true, id: String(doc._id), status: doc.status });
  }
);
