/**
 * The admin feedback inbox — queries shared by the admin page (first paint)
 * and the admin API (filtering, paging, status changes).
 *
 * Server-only, not `"use server"`. Callers must already have passed the
 * admin guard.
 */

import connectDB from "@/lib/mongoose";
import Feedback, { FEEDBACK_STATUSES } from "@/models/Feedback";
import User from "@/models/User";

export const FEEDBACK_PAGE_SIZE = 25;

/**
 * Lean list item. Only the sender's email is resolved from their account —
 * never the rest of the user document.
 */
function toItem(doc, emailById) {
  const userId = doc.userId ? String(doc.userId) : null;
  return {
    id: String(doc._id),
    message: doc.message,
    type: doc.kind,
    email: doc.contactEmail || (userId ? emailById.get(userId) ?? null : null),
    userId,
    route: doc.route ?? null,
    status: FEEDBACK_STATUSES.includes(doc.status) ? doc.status : "read",
    adminNote: doc.adminNote ?? "",
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
  };
}

/**
 * Newest first, cursor-paginated on `_id` (monotonic with creation time), so
 * paging stays stable while new feedback arrives.
 *
 * @param {{status?: 'new'|'read'|'archived'|'all', cursor?: string, limit?: number}} opts
 * @returns {Promise<{items: object[], nextCursor: string|null}>}
 */
export async function listFeedback({ status = "new", cursor, limit = FEEDBACK_PAGE_SIZE } = {}) {
  await connectDB();

  const filter = {};
  if (status === "read") {
    // Legacy triage states read as "seen".
    filter.status = { $in: ["read", "triaged", "resolved", "wont_fix"] };
  } else if (status !== "all") {
    filter.status = status;
  }
  if (cursor) filter._id = { $lt: cursor };

  const docs = await Feedback.find(filter)
    .select("userId contactEmail kind message route status adminNote createdAt")
    .sort({ _id: -1 })
    .limit(limit + 1)
    .lean();

  const page = docs.slice(0, limit);
  const userIds = [...new Set(page.filter((d) => d.userId).map((d) => String(d.userId)))];
  const users = userIds.length
    ? await User.find({ _id: { $in: userIds } }).select("email").lean()
    : [];
  const emailById = new Map(users.map((u) => [String(u._id), u.email]));

  return {
    items: page.map((d) => toItem(d, emailById)),
    nextCursor: docs.length > limit ? String(page[page.length - 1]._id) : null,
  };
}

/** Count per inbox tab. */
export async function feedbackCounts() {
  await connectDB();
  const rows = await Feedback.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]);
  const counts = { new: 0, read: 0, archived: 0 };
  for (const row of rows) {
    if (row._id === "new" || row._id === "archived") counts[row._id] += row.n;
    else counts.read += row.n;
  }
  return counts;
}
