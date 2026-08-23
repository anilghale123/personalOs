import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongoose";
import Insight from "@/models/Insight";
import { renderStatement } from "@/features/patterns/constants";

const RATINGS = ["useful", "not_useful", "knew_it"];
const STATUS_ACTIONS = new Set(["dismiss", "undismiss"]);

/**
 * GET /api/patterns/insights/[id]
 * One insight, full detail — the "why is this true" view.
 */
export async function GET(request, { params }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();
  const doc = await Insight.findOne({ _id: params.id, userId: session.user.id }).lean();
  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    ...doc,
    id: String(doc._id),
    statement: renderStatement(doc.statementKey, doc.statementVars),
  });
}

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
export async function PATCH(request, { params }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));

  const update = {};
  if (body?.action !== undefined) {
    if (!STATUS_ACTIONS.has(body.action)) {
      return NextResponse.json({ error: "Invalid action." }, { status: 400 });
    }
    update.status = body.action === "dismiss" ? "dismissed" : "stale";
  }
  if (body?.rating !== undefined) {
    if (!RATINGS.includes(body.rating)) {
      return NextResponse.json({ error: "Invalid rating." }, { status: 400 });
    }
    update.feedback = {
      rating: body.rating,
      note: typeof body.note === "string" ? body.note.trim() : undefined,
      at: new Date(),
    };
  }
  if (body?.read === true) {
    update.readAt = new Date();
  }

  if (!Object.keys(update).length) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  await connectDB();
  const doc = await Insight.findOneAndUpdate(
    { _id: params.id, userId: session.user.id },
    {
      $set: update,
      // Counted so a second dismissal suppresses the pattern in future
      // runs — see buildSuppressionSet in persist.js.
      ...(body?.action === "dismiss" ? { $inc: { dismissCount: 1 } } : {}),
    },
    { new: true, runValidators: true }
  ).lean();
  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, id: String(doc._id), status: doc.status });
}
