/**
 * Password reset code lifecycle.
 *
 * Server-only, but deliberately not `"use server"` so the API route can
 * import it directly.
 *
 * The properties this has to get right:
 *
 *   1. **The code is unpredictable.** `crypto.randomInt`, not `Math.random`.
 *   2. **The database never holds the code.** Only a keyed HMAC — six digits
 *      is a tiny space, so an unkeyed hash would be reversible from a dump.
 *   3. **Guessing is bounded.** Each code allows `MAX_ATTEMPTS` wrong tries,
 *      and each account can be issued a new code at most once per
 *      `RESEND_COOLDOWN_SEC` (plus the route's hourly limit). That caps an
 *      attacker at a few dozen guesses an hour against a million-code space.
 *   4. **Single use, provably.** Claiming is one atomic `findOneAndUpdate`
 *      matching only while `usedAt` is null.
 *   5. **Only one live code.** Issuing a new code burns the previous one, so
 *      "which email was the right one" never comes up.
 */

import crypto from "node:crypto";
import connectDB from "@/lib/mongoose";
import PasswordResetCode from "@/models/PasswordResetCode";
import User from "@/models/User";

/** How long a code stays valid. */
export const RESET_EXPIRY_MINUTES = 15;
/** Wrong guesses allowed per code before it is dead. */
export const MAX_ATTEMPTS = 5;
/** Minimum gap between two codes for the same account. */
export const RESEND_COOLDOWN_SEC = 60;
/** Digits in a code. */
export const CODE_LENGTH = 6;

/** A zero-padded numeric code from a CSPRNG. */
export function generateCode() {
  return crypto.randomInt(0, 10 ** CODE_LENGTH).toString().padStart(CODE_LENGTH, "0");
}

/** Read lazily so tests and scripts can set the secret after import. */
function secret() {
  const value = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is required to hash reset codes.");
  return value;
}

/**
 * Keyed hash of a code, bound to one user — the same six digits for two
 * accounts produce unrelated hashes.
 * @param {string} userId
 * @param {string} code
 */
export function hashCode(userId, code) {
  return crypto
    .createHmac("sha256", secret())
    .update(`${String(userId)}:${String(code)}`)
    .digest("hex");
}

/** Constant-time comparison; false (not a throw) on a length mismatch. */
export function hashesMatch(a, b) {
  const bufA = Buffer.from(String(a), "utf8");
  const bufB = Buffer.from(String(b), "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Issue a reset code for an email address.
 *
 * Returns `null` when nothing should be sent — no such account, a
 * Google-only account, or a code issued within the cooldown. **The caller
 * must respond identically either way**, or this endpoint becomes a
 * membership oracle.
 *
 * @param {string} email already normalised
 * @param {{ip?: string}} [meta]
 * @returns {Promise<{code: string, user: object, expiresAt: Date}|null>}
 */
export async function issueResetCode(email, meta = {}) {
  await connectDB();

  const user = await User.findOne({ email }).select("_id name email passwordHash").lean();
  if (!user || !user.passwordHash) return null;

  const latest = await PasswordResetCode.findOne({ userId: user._id })
    .sort({ createdAt: -1 })
    .select("createdAt")
    .lean();
  if (latest && Date.now() - latest.createdAt.getTime() < RESEND_COOLDOWN_SEC * 1000) {
    return null;
  }

  // One live code at a time.
  await invalidateUserCodes(user._id);

  const code = generateCode();
  const expiresAt = new Date(Date.now() + RESET_EXPIRY_MINUTES * 60_000);

  await PasswordResetCode.create({
    userId: user._id,
    codeHash: hashCode(user._id, code),
    expiresAt,
    requestedIp: meta.ip,
  });

  return { code, user, expiresAt };
}

/**
 * Check a code and, if it is right, consume it.
 *
 * Every failure — unknown email, no live code, too many attempts, wrong code
 * — returns `null`, so the route can give one answer that reveals nothing.
 *
 * The attempt counter is incremented *before* comparing, in the same atomic
 * update that checks the cap, so parallel guesses cannot all slip in under
 * the limit.
 *
 * @param {string} email already normalised
 * @param {string} code
 * @returns {Promise<{userId: string}|null>}
 */
export async function consumeResetCode(email, code) {
  if (typeof code !== "string" || !/^\d+$/.test(code)) return null;
  await connectDB();

  const user = await User.findOne({ email }).select("_id").lean();
  if (!user) return null;

  const doc = await PasswordResetCode.findOneAndUpdate(
    {
      userId: user._id,
      usedAt: null,
      expiresAt: { $gt: new Date() },
      attempts: { $lt: MAX_ATTEMPTS },
    },
    { $inc: { attempts: 1 } },
    { sort: { createdAt: -1 }, new: true }
  )
    .select("_id codeHash")
    .lean();
  if (!doc) return null;

  if (!hashesMatch(doc.codeHash, hashCode(user._id, code))) return null;

  const claimed = await PasswordResetCode.findOneAndUpdate(
    { _id: doc._id, usedAt: null },
    { $set: { usedAt: new Date() } }
  )
    .select("_id")
    .lean();

  return claimed ? { userId: String(user._id) } : null;
}

/**
 * Burn every outstanding code for a user — on reissue, and after a
 * successful reset.
 * @param {string} userId
 */
export async function invalidateUserCodes(userId) {
  await connectDB();
  await PasswordResetCode.updateMany(
    { userId, usedAt: null },
    { $set: { usedAt: new Date() } }
  );
}
