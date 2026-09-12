import { withRoute, json } from "@/lib/api";
import { z, text, optionalText } from "@/lib/validation";
import { log } from "@/lib/logger";
import Feedback from "@/models/Feedback";

const FeedbackBody = z.object({
  kind: z.enum(["bug", "idea", "confusing", "praise", "other"]).default("other"),
  message: text(4000).pipe(
    z.string().min(3, "Tell us a little more so we can act on it.")
  ),
  route: optionalText(200),
  viewport: optionalText(40),
});

/**
 * POST /api/feedback — a user tells us something.
 *
 * Rate limited generously: this must never feel gated, but it is a write
 * endpoint like any other.
 *
 * Body: { kind, message, route?, viewport? }
 */
export const POST = withRoute(
  { limit: "feedback", body: FeedbackBody },
  async ({ userId, input, request }) => {
    const doc = await Feedback.create({
      userId,
      kind: input.kind,
      message: input.message,
      route: input.route,
      viewport: input.viewport,
      // Truncated: the full string is long, and the browser/OS prefix is the
      // only part that helps reproduce a layout or compatibility problem.
      userAgent: request.headers.get("user-agent")?.slice(0, 300),
    });

    // Deliberately logs that feedback arrived and where from, never the
    // message body — it is the user's words and belongs in the database, not
    // in a log aggregator.
    log.info("Feedback received", {
      feedbackId: String(doc._id),
      userId,
      kind: input.kind,
      route: input.route,
    });

    return json(
      { ok: true, id: String(doc._id), message: "Thank you — this goes straight to the developer." },
      { status: 201 }
    );
  }
);

/**
 * GET /api/feedback — what this user has already sent.
 *
 * Scoped to the caller, so it shows someone their own history and closes the
 * loop when a report has been responded to. It is not an admin view.
 */
export const GET = withRoute({ limit: "read" }, async ({ userId }) => {
  const items = await Feedback.find({ userId })
    .select("kind message status route createdAt respondedAt")
    .sort({ createdAt: -1 })
    .limit(25)
    .lean();

  return json({ items });
});
