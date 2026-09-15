import mongoose from "mongoose";

/**
 * One device that has opted in to push reminders.
 *
 * Reminders are per device, not per account: someone may want the nudge on
 * their phone and not their work laptop, and each browser hands out its own
 * endpoint anyway. The endpoint is unique — if a second person signs in on
 * the same phone and turns reminders on, the row moves to them rather than
 * notifying both.
 */
const PushSubscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: { type: String, trim: true, maxlength: 300 },
    /**
     * `YYYY-MM-DD:slot` of the last reminder delivered here. A cron retry
     * (or a manual re-run) skips devices already reminded for that slot, so
     * nobody gets the same nudge twice.
     */
    lastSentKey: { type: String },
  },
  { timestamps: true }
);

export default mongoose.models.PushSubscription ||
  mongoose.model("PushSubscription", PushSubscriptionSchema);
