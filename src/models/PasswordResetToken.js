import mongoose from "mongoose";

/**
 * A single-use password reset grant.
 *
 * The document stores a **SHA-256 hash** of the token, never the token
 * itself. The plaintext exists only in the email link, so a dump of this
 * collection cannot be used to reset anybody's password — the same reason
 * passwords are hashed, applied to the thing that can replace a password.
 *
 * Single-use is enforced by `usedAt` rather than by deleting the row, so a
 * second click on the same link can be told "this link has already been
 * used" instead of the ambiguous "invalid or expired".
 */
const PasswordResetTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    /** sha256(token) — the plaintext never reaches the database. */
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    /** Coarse audit trail for "was this me?" support questions. */
    requestedIp: String,
  },
  { timestamps: true }
);

/**
 * Mongo drops these automatically once expired. The TTL monitor runs about
 * once a minute, so expiry is enforced in application code too — this index
 * is housekeeping, not the security boundary.
 */
PasswordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/** Invalidating every outstanding token for one user on a successful reset. */
PasswordResetTokenSchema.index({ userId: 1, usedAt: 1 });

export default mongoose.models.PasswordResetToken ||
  mongoose.model("PasswordResetToken", PasswordResetTokenSchema);
