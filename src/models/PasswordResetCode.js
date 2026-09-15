import mongoose from "mongoose";

/**
 * A one-time password reset code (6 digits, emailed).
 *
 * The document stores an **HMAC** of the code keyed with the app secret,
 * never the code itself. A plain sha256 would not do here: six digits is only
 * a million possibilities, so an unkeyed hash from a leaked dump reverses in
 * milliseconds. Without the secret the HMAC is useless.
 *
 * Replaces the old link-token collection (`PasswordResetToken`) — a separate
 * collection rather than a changed schema, because that collection carries a
 * unique index on `tokenHash` that documents without the field would collide
 * on.
 */
const PasswordResetCodeSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    /** HMAC-SHA256(secret, `${userId}:${code}`) — the code never reaches the database. */
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    /** Wrong guesses against this code. Locked once it reaches the cap. */
    attempts: { type: Number, default: 0 },
    usedAt: { type: Date, default: null },
    /** Coarse audit trail for "was this me?" support questions. */
    requestedIp: String,
  },
  { timestamps: true }
);

/** Housekeeping only — expiry is enforced in application code too. */
PasswordResetCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/** "The live code for this user", newest first. */
PasswordResetCodeSchema.index({ userId: 1, usedAt: 1, createdAt: -1 });

export default mongoose.models.PasswordResetCode ||
  mongoose.model("PasswordResetCode", PasswordResetCodeSchema);
