/**
 * Server-side plan lookup.
 *
 * Re-read from the database on every gated request, for the same reason the
 * admin guard re-reads the role: a JWT is a snapshot, and a downgrade has to
 * take effect immediately rather than when the token expires.
 */

import connectDB from "@/lib/mongoose";
import { ApiError } from "@/lib/api";
import { isProUser } from "@/lib/plans";
import User from "@/models/User";

/**
 * @param {string} userId
 * @returns {Promise<{plan: 'free'|'pro', isPro: boolean}>}
 */
export async function getEntitlements(userId) {
  if (!userId) return { plan: "free", isPro: false };
  await connectDB();
  const user = await User.findById(userId).select("plan role email").lean();
  const isPro = isProUser(user);
  return { plan: isPro ? "pro" : "free", isPro };
}

/**
 * Throw a 402 `pro_required` unless the user is Pro. Pro tools are hidden
 * from free accounts in the UI; this is the server-side enforcement.
 * @param {string} userId
 * @param {string} [message]
 */
export async function requirePro(userId, message = "This is a Pro feature.") {
  const { isPro } = await getEntitlements(userId);
  if (!isPro) throw new ApiError(402, message, "pro_required");
}
