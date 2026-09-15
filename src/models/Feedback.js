import mongoose from "mongoose";

/**
 * Feedback — what a user tells us is wrong (or right).
 *
 * `route` and `userAgent` are captured automatically rather than asked for.
 * Nobody accurately describes which screen they were on, and asking them to
 * is the difference between feedback given and feedback abandoned.
 *
 * Signed-out visitors can send feedback too (from the sign-in screen — often
 * exactly where something went wrong), so `userId` is optional and a
 * `contactEmail` can stand in for it.
 */
export const FEEDBACK_KINDS = ["bug", "idea", "confusing", "praise", "other"];

/**
 * Triage states. `new → read → archived` is what the admin inbox uses; the
 * older values are kept so documents written before the inbox still load.
 */
export const FEEDBACK_STATUSES = ["new", "read", "archived"];
const LEGACY_STATUSES = ["triaged", "resolved", "wont_fix"];

const FeedbackSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    /** Only for signed-out senders; a signed-in user's email is looked up. */
    contactEmail: { type: String, trim: true, lowercase: true, maxlength: 254 },
    kind: { type: String, enum: FEEDBACK_KINDS, default: "other" },
    message: { type: String, required: true, trim: true, maxlength: 4000 },
    route: { type: String, trim: true },
    userAgent: { type: String, trim: true },
    viewport: { type: String, trim: true },
    status: {
      type: String,
      enum: [...FEEDBACK_STATUSES, ...LEGACY_STATUSES],
      default: "new",
    },
    /** Internal-only note from whoever triaged it. Never shown to the sender. */
    adminNote: { type: String, trim: true, maxlength: 2000 },
    respondedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// The triage queue: newest first within a status.
FeedbackSchema.index({ status: 1, _id: -1 });
// "What has this user told us before".
FeedbackSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.models.Feedback ||
  mongoose.model("Feedback", FeedbackSchema);
