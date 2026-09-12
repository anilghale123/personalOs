/**
 * Password reset token lifecycle.
 *
 * Server-only, but deliberately not `"use server"` so both API routes can
 * import it directly.
 *
 * Four properties this has to get right, all of them easy to get subtly
 * wrong:
 *
 *   1. **The token is unguessable.** 32 bytes from `crypto.randomBytes`,
 *      not `Math.random`.
 *   2. **The database never holds the token.** Only `sha256(token)`, so a
 *      leaked dump cannot reset anyone's password. No salt or bcrypt here:
 *      the input is already 256 bits of entropy, so there is nothing to
 *      brute-force and a fast hash is correct.
 *   3. **Single use, and provably so.** Claiming a token is one atomic
 *      `findOneAndUpdate` that only matches while `usedAt` is null, so two
 *      simultaneous clicks cannot both succeed.
 *   4. **Comparison is constant-time**, via `timingSafeEqual` on the hash.
 */

import crypto from "node:crypto";
import connectDB from "@/lib/mongoose";
import PasswordResetToken from "@/models/PasswordResetToken";
import User from "@/models/User";

/** How long a reset link stays valid. */
export const RESET_EXPIRY_MINUTES = 30;
/** Outstanding unused tokens one account may hold before we stop issuing. */
const MAX_OUTSTANDING = 5;

/** sha256 hex of a token. */
export function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

/**
 * Constant-time hash comparison. Not strictly required once the value is a
 * fixed-length hex digest looked up by index, but the cost is nil and it
 * removes the question.
 */
export function hashesMatch(a, b) {
  const bufA = Buffer.from(String(a), "utf8");
  const bufB = Buffer.from(String(b), "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Issue a reset token for an email address.
 *
 * Returns `null` when no reset should be sent — no such account, or a
 * Google-only account with no password to reset. **The caller must respond
 * identically either way**: a different response for a known and unknown
 * email turns this endpoint into a membership oracle, which matters more
 * here than at signup because it needs no rate limit to exploit at scale.
 *
 * @param {string} email already normalised
 * @param {{ip?: string}} [meta]
 * @returns {Promise<{token: string, user: object, expiresAt: Date}|null>}
 */
export async function issueResetToken(email, meta = {}) {
  await connectDB();

  const user = await User.findOne({ email }).select("_id name email passwordHash");
  if (!user) return null;

  // A Google-only account has no password to reset. Sending a "choose a new
  // password" link would work — it would set a first password — but it
  // would also be a confusing thing to receive, so the login form steers
  // these users to Google instead.
  if (!user.passwordHash) return null;

  // Cheap flood guard on top of the route's rate limit: someone repeatedly
  // requesting resets for one address cannot pile up unbounded live tokens.
  const outstanding = await PasswordResetToken.countDocuments({
    userId: user._id,
    usedAt: null,
    expiresAt: { $gt: new Date() },
  });
  if (outstanding >= MAX_OUTSTANDING) return null;

  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + RESET_EXPIRY_MINUTES * 60_000);

  await PasswordResetToken.create({
    userId: user._id,
    tokenHash: hashToken(token),
    expiresAt,
    requestedIp: meta.ip,
  });

  return { token, user, expiresAt };
}

/**
 * Look up a token without consuming it — used to decide whether to render
 * the "choose a new password" form or an "this link has expired" message.
 * @param {string} token
 * @returns {Promise<{valid: boolean, reason?: 'unknown'|'used'|'expired'}>}
 */
export async function inspectResetToken(token) {
  if (!token || typeof token !== "string") return { valid: false, reason: "unknown" };
  await connectDB();

  const doc = await PasswordResetToken.findOne({ tokenHash: hashToken(token) })
    .select("usedAt expiresAt")
    .lean();

  if (!doc) return { valid: false, reason: "unknown" };
  if (doc.usedAt) return { valid: false, reason: "used" };
  if (doc.expiresAt <= new Date()) return { valid: false, reason: "expired" };
  return { valid: true };
}

/**
 * Atomically claim a token.
 *
 * The `usedAt: null` clause inside the query — not a read-then-write — is
 * what makes single-use real: two concurrent requests race on the same
 * document and exactly one matches.
 *
 * @param {string} token
 * @returns {Promise<{userId: string}|null>} null when invalid, used or expired
 */
export async function claimResetToken(token) {
  if (!token || typeof token !== "string") return null;
  await connectDB();

  const claimed = await PasswordResetToken.findOneAndUpdate(
    {
      tokenHash: hashToken(token),
      usedAt: null,
      expiresAt: { $gt: new Date() },
    },
    { $set: { usedAt: new Date() } },
    { new: true }
  ).lean();

  if (!claimed) return null;
  return { userId: String(claimed.userId) };
}

/**
 * Invalidate every outstanding token for a user. Called after a successful
 * reset so a second link sitting in an inbox — or in an attacker's hands —
 * is dead the moment the first one is used.
 * @param {string} userId
 */
export async function invalidateUserTokens(userId) {
  await connectDB();
  await PasswordResetToken.updateMany(
    { userId, usedAt: null },
    { $set: { usedAt: new Date() } }
  );
}
