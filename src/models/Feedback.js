import mongoose from "mongoose";

/**
 * Feedback — what a user tells us is wrong.
 *
 * The point of a limited beta is to learn, and there was previously no
 * in-app way to say anything: a user hitting a bug would shrug and stop
 * using the app, leaving a drop-off with no attached reason.
 *
 * `route` and `userAgent` are captured automatically rather than asked for.
 * Nobody accurately describes which screen they were on, and asking them to
 * is the difference between feedback given and feedback abandoned.
 */
const FeedbackSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    /** What kind of report this is — shapes triage, not validation. */
    kind: {
      type: String,
      enum: ["bug", "idea", "confusing", "praise", "other"],
      default: "other",
    },
    message: { type: String, required: true, trim: true, maxlength: 4000 },
    /** Where they were when they wrote it, captured by the client. */
    route: { type: String, trim: true },
    userAgent: { type: String, trim: true },
    /** Viewport, which turns "the layout is broken" into something actionable. */
    viewport: { type: String, trim: true },
    /**
     * Triage state. Nothing is deleted — a dismissed report is still
     * evidence about what confused someone.
     */
    status: {
      type: String,
      enum: ["new", "triaged", "resolved", "wont_fix"],
      default: "new",
    },
    /** Set when someone replies, so a user is never silently ignored. */
    respondedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// The triage queue: newest unresolved first.
FeedbackSchema.index({ status: 1, createdAt: -1 });
// "What has this user told us before" when replying to one person.
FeedbackSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.models.Feedback ||
  mongoose.model("Feedback", FeedbackSchema);
