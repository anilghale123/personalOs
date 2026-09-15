/**
 * Free vs Pro.
 *
 * Pure functions (no DB) so the rule is testable and shared by routes and
 * pages. The server-side lookup lives in `lib/entitlements.js`.
 *
 * Pro when any of:
 *   - `user.plan === "pro"` (set by an admin on the Users page)
 *   - the email is in `PRO_EMAILS` (comma-separated env allowlist)
 *   - the account is an admin — so gated features can be tested without
 *     granting yourself a plan
 */

import { canAccessAdmin } from "@/lib/roles";

export const PLANS = ["free", "pro"];

export const PLAN_LABELS = { free: "Free", pro: "Pro" };

/** Parse the allowlist on each call so tests and env changes take effect. */
export function proEmailAllowlist(raw = process.env.PRO_EMAILS) {
  return (raw || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * @param {{plan?: string, role?: string, email?: string}|null} user
 * @param {string[]} [allowlist]
 */
export function isProUser(user, allowlist = proEmailAllowlist()) {
  if (!user) return false;
  if (user.plan === "pro") return true;
  if (canAccessAdmin(user.role)) return true;
  return Boolean(user.email && allowlist.includes(String(user.email).toLowerCase()));
}
