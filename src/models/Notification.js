import mongoose from "mongoose";

export const NOTIFICATION_KINDS = ["goal-time", "daily", "test"];

/**
 * One entry in the in-app notification inbox (the bell).
 *
 * Every reminder that goes out as a push is also written here, so there is a
 * record of it even when the system notification never showed — permission
 * blocked, Focus Assist on, the device offline, or no device subscribed at all.
 */
const NotificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    kind: { type: String, enum: NOTIFICATION_KINDS, required: true },
    title: { type: String, required: true, trim: true, maxlength: 300 },
    body: { type: String, trim: true, maxlength: 1000 },
    url: { type: String, trim: true, default: "/app" },
    readAt: { type: Date, default: null },
    /**
     * Optional idempotency key, e.g. `daily:2026-09-17:morning`. A cron retry
     * writing the same reminder again collides on it instead of duplicating.
     */
    dedupeKey: { type: String },
  },
  { timestamps: true }
);

// The bell: newest first for one user.
NotificationSchema.index({ userId: 1, createdAt: -1 });
NotificationSchema.index(
  { userId: 1, dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: "string" } } }
);
// Old notifications clear themselves out after 60 days.
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 24 * 60 * 60 });

export default mongoose.models.Notification ||
  mongoose.model("Notification", NotificationSchema);
