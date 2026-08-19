/**
 * Budget-vs-spend derivation. Server-only (touches mongoose models) but
 * deliberately not a "use server" module so both the API routes and the
 * page's server actions can call it directly.
 */

import Budget from "@/models/Budget";
import Expense from "@/models/Expense";
import { sumMinor } from "@/lib/money";
import { budgetPeriodRange } from "./utils";

const keyOf = (b) => `${b.scope}:${b.categoryId || "total"}`;

/**
 * The budgets that apply to `periodStart`. A budget set in an earlier
 * period still applies if it was saved with `carryForward`, so the user
 * doesn't have to re-enter the same number every week or month.
 */
function applicableBudgets(all, periodStart) {
  const byKey = new Map();
  // `all` arrives newest-first, so the first hit for a key wins.
  for (const b of all) {
    const key = keyOf(b);
    if (byKey.has(key)) continue;
    if (b.periodStart === periodStart) {
      byKey.set(key, { ...b, carried: false });
    } else if (b.carryForward) {
      byKey.set(key, { ...b, carried: true });
    }
  }
  return [...byKey.values()];
}

/**
 * Budget limits and actual spend for one period.
 * @param {string} userId
 * @param {'weekly'|'monthly'} period
 * @param {Date} [date] anchor — defaults to now
 */
export async function computeBudgetSummary(userId, period = "monthly", date = new Date()) {
  const { start, end } = budgetPeriodRange(period, date);

  const [stored, expenses] = await Promise.all([
    Budget.find({ userId, period, periodStart: { $lte: start } })
      .sort({ periodStart: -1 })
      .lean(),
    Expense.find({
      userId,
      deletedAt: null,
      date: { $gte: start, $lte: end },
    })
      .select("amountPaisa categoryId")
      .lean(),
  ]);

  const budgets = applicableBudgets(stored, start);
  const spentPaisa = sumMinor(expenses);

  const spentByCategory = {};
  for (const e of expenses) {
    const id = String(e.categoryId);
    spentByCategory[id] = (spentByCategory[id] || 0) + (e.amountPaisa || 0);
  }

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
    periodStart: start,
    periodEnd: end,
    totalBudgetPaisa: total?.amountPaisa || 0,
    totalBudgetId: total ? String(total._id) : null,
    totalCarried: Boolean(total?.carried),
    totalCarryForward: total ? total.carryForward : true,
    spentPaisa,
    expenseCount: expenses.length,
    categories,
    spentByCategory,
  };
}
