/**
 * Budget-vs-spend derivation. Server-only (touches mongoose models) but
 * deliberately not a "use server" module so both the API routes and the
 * page's server actions can call it directly.
 */

import mongoose from "mongoose";
import Budget from "@/models/Budget";
import Expense from "@/models/Expense";
import User from "@/models/User";
import { cachedMoney, cachedReference, tags } from "@/lib/cache";
import { budgetPeriodRange, budgetPeriodLabel } from "./utils";

const keyOf = (b) => `${b.scope}:${b.categoryId || "total"}`;

/**
 * The budgets that apply to the period `start`..`end`. A budget set in an
 * earlier period still applies if it was saved with `carryForward`, so
 * the user doesn't have to re-enter the same number every week or month.
 *
 * "Belongs to this period" is a range test rather than an exact match on
 * `periodStart`: a Nepali month runs from the middle of one Gregorian
 * month to the middle of the next, so a budget saved before the calendar
 * preference changed can carry a `periodStart` that sits inside the
 * current period without being equal to it.
 */
function applicableBudgets(all, start, end) {
  const byKey = new Map();
  // `all` arrives newest-first, so the first hit for a key wins.
  for (const b of all) {
    const key = keyOf(b);
    if (byKey.has(key)) continue;
    if (b.periodStart >= start && b.periodStart <= end) {
      byKey.set(key, { ...b, carried: false });
    } else if (b.periodStart < start && b.carryForward) {
      byKey.set(key, { ...b, carried: true });
    }
  }
  return [...byKey.values()];
}

/**
 * The calendar the user reads months in. Resolved here so every caller —
 * page, API route and detector alike — lands on the same window without
 * having to remember to pass it.
 */
export async function userCalendar(userId) {
  /**
   * Cached as reference data: a calendar preference changes about never, and
   * this was previously an extra round trip on every money read — the budget
   * page, the expenses page and each detector all asked independently.
   * Invalidated by the profile route when the preference actually changes.
   */
  return cachedReference(
    async () => {
      const user = await User.findById(userId)
        .select("preferences.dateFormat")
        .lean();
      return user?.preferences?.dateFormat === "nepali" ? "np" : "en";
    },
    {
      userId,
      key: "user-calendar",
      tags: [tags.profile(userId)],
      seconds: 60 * 60,
    }
  );
}

/**
 * Budget limits and actual spend for one period.
 * @param {string} userId
 * @param {'weekly'|'monthly'} period
 * @param {object} [options]
 * @param {Date} [options.date] anchor — defaults to now
 * @param {'en'|'np'} [options.cal] month calendar — defaults to the
 *   user's own preference, so "this month" here means the same month the
 *   expenses list is showing them
 */
export async function computeBudgetSummary(userId, period = "monthly", options = {}) {
  const { date = new Date() } = options;
  const cal = options.cal ?? (await userCalendar(userId));
  const { start, end } = budgetPeriodRange(period, date, cal);

  /**
   * Tier-1 cache: derived money, invalidated by tag on every expense, budget
   * or category write — never on a timer. A user who logs an expense and sees
   * an unchanged total does not think "cache lag", they think the app lost
   * their money. See the tier note in lib/cache.js.
   *
   * The window is part of the key, so browsing back through months caches
   * each one separately instead of thrashing a single entry.
   */
  const { budgets, spentPaisa, spentByCategory, expenseCount } = await cachedMoney(
    async () => {
      const [stored, spendRows] = await Promise.all([
        Budget.find({ userId, period, periodStart: { $lte: end } })
          .sort({ periodStart: -1 })
          .lean(),

        /**
         * Spend grouped in Mongo rather than every row fetched and reduced
         * here. A month of expenses is small, but this runs on the budget
         * page, the expenses page and inside the pattern engine, and the rows
         * themselves were never needed — only the sums.
         */
        Expense.aggregate([
          {
            $match: {
              userId: new mongoose.Types.ObjectId(userId),
              deletedAt: null,
              date: { $gte: start, $lte: end },
            },
          },
          {
            $group: {
              _id: "$categoryId",
              spentPaisa: { $sum: "$amountPaisa" },
              count: { $sum: 1 },
            },
          },
        ]),
      ]);

      const byCategory = {};
      let total = 0;
      let count = 0;
      for (const row of spendRows) {
        byCategory[String(row._id)] = row.spentPaisa;
        total += row.spentPaisa;
        count += row.count;
      }

      return {
        budgets: applicableBudgets(stored, start, end),
        spentPaisa: total,
        spentByCategory: byCategory,
        expenseCount: count,
      };
    },
    {
      userId,
      key: "budget-summary",
      deps: [period, cal, start, end],
      tags: [tags.money(userId), tags.expenses(userId), tags.budgets(userId)],
    }
  );

  const total = budgets.find((b) => b.scope === "total") || null;
  const categories = budgets
    .filter((b) => b.scope === "category" && b.categoryId)
    .map((b) => ({
      budgetId: String(b._id),
      categoryId: String(b.categoryId),
      budgetPaisa: b.amountPaisa,
      spentPaisa: spentByCategory[String(b.categoryId)] || 0,
      carryForward: b.carryForward,
      carried: b.carried,
    }));

  return {
    period,
    cal,
    periodStart: start,
    periodEnd: end,
    // Rendered here because only the server knows which calendar the
    // window was measured in.
    periodLabel: budgetPeriodLabel(period, date, cal),
    totalBudgetPaisa: total?.amountPaisa || 0,
    totalBudgetId: total ? String(total._id) : null,
    totalCarried: Boolean(total?.carried),
    totalCarryForward: total ? total.carryForward : true,
    spentPaisa,
    expenseCount,
    categories,
    spentByCategory,
  };
}
