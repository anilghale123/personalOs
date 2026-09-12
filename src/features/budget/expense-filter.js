/**
 * Expense query filter construction.
 *
 * Extracted from the route so it can be tested directly. The bug this guards
 * against is subtle and produces *plausible* wrong numbers rather than an
 * error: `find()` casts a 24-character hex string to an `ObjectId` via the
 * schema, but `aggregate()` does no casting at all, so the same filter object
 * used in a `$match` matches zero documents and the total comes back as 0
 * while the listed rows look perfectly correct.
 */

import mongoose from "mongoose";
import { searchRegex } from "@/lib/utils";

/**
 * @param {string} userId
 * @param {object} query already validated
 * @param {{forAggregation?: boolean}} [options]
 */
export function buildExpenseFilter(userId, query, { forAggregation = false } = {}) {
  const oid = (v) => (forAggregation ? new mongoose.Types.ObjectId(String(v)) : v);

  const filter = { userId: oid(userId), deletedAt: null };

  if (query.categoryId) filter.categoryId = oid(query.categoryId);
  if (query.paymentMethod) filter.paymentMethod = query.paymentMethod;

  if (query.dateFrom || query.dateTo) {
    filter.date = {};
    if (query.dateFrom) filter.date.$gte = query.dateFrom;
    if (query.dateTo) filter.date.$lte = query.dateTo;
  }

  if (query.tag) filter.tags = query.tag;

  // Never a raw regex: an unbalanced paren threw (a 500 for anyone typing a
  // question mark) and `(a+)+$` backtracked catastrophically.
  const noteMatch = searchRegex(query.q);
  if (noteMatch) filter.note = noteMatch;

  return filter;
}
