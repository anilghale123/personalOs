import { withRoute, json } from "@/lib/api";
import { z, text, optionalText, email as emailSchema, blankAsAbsent } from "@/lib/validation";
import { getSession } from "@/lib/session";
import { log } from "@/lib/logger";
import Feedback, { FEEDBACK_KINDS } from "@/models/Feedback";

const FeedbackBody = z.object({
  message: text(4000).pipe(
    z.string().min(3, "Tell us a little more so we can act on it.")
  ),
  type: z.enum(FEEDBACK_KINDS).optional(),
  /** Only used when signed out — a signed-in user's account email is known. */
  email: blankAsAbsent(emailSchema),
  // Context the client attaches automatically; small and optional.
  route: optionalText(200),
  viewport: optionalText(40),
});

/**
 * POST /api/feedback — anyone can tell us something, signed in or not.
 *
 * Body: { message, type?, email?, route?, viewport? }  →  201 { ok: true }
 *
 * The user id comes from the session, never from the body — a client cannot
 * attribute feedback to someone else. Rate limited per user, else per IP.
 */
export const POST = withRoute(
  { auth: false, limit: "feedback", body: FeedbackBody },
  async ({ input, request }) => {
    const session = await getSession();
    const userId = session?.user?.id ?? null;

    const doc = await Feedback.create({
      userId,
      contactEmail: userId ? undefined : input.email,
      kind: input.type ?? "other",
      message: input.message,
      route: input.route,
      viewport: input.viewport,
      // The browser/OS prefix is the only part that helps reproduce an issue.
      userAgent: request.headers.get("user-agent")?.slice(0, 300),
    });

    // Never logs the message body — it is the user's words and belongs in
    // the database, not in a log aggregator.
    log.info("Feedback received", {
      feedbackId: String(doc._id),
      userId,
      kind: doc.kind,
      anonymous: !userId,
    });

    return json({ ok: true }, { status: 201 });
  }
);

/**
 * GET /api/feedback — what this user has already sent (their own only).
 * → { items: [{ id, type, message, status, createdAt }] }
 */
export const GET = withRoute({ limit: "read" }, async ({ userId }) => {
  const docs = await Feedback.find({ userId })
    .select("kind message status createdAt")
    .sort({ createdAt: -1 })
    .limit(25)
    .lean();

  return json({
    items: docs.map((d) => ({
      id: String(d._id),
      type: d.kind,
      message: d.message,
      status: d.status,
      createdAt: d.createdAt,
    })),
  });
});
