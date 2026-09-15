import { withRoute, json } from "@/lib/api";
import { cachedMoney, tags } from "@/lib/cache";
import { userCalendar } from "@/features/budget/summary";
import Expense from "@/models/Expense";

/**
 * GET /api/budget/meta — what the Expenses screen needs before its first
 * paint: how far back the history goes (for the monthly record pager) and
 * which calendar to label months in.
 *
 * Both are cached server-side; the screen also keeps a saved copy, so this
 * normally runs in the background.
 */
export const GET = withRoute({ limit: "read" }, async ({ userId }) => {
  const [earliestDate, cal] = await Promise.all([
    // Same cache entry as GET /api/budget/expenses uses.
    cachedMoney(
      async () => {
        const doc = await Expense.findOne({ userId, deletedAt: null })
          .sort({ date: 1 })
          .select("date")
          .lean();
        return doc?.date ?? null;
      },
      { userId, key: "earliest-expense", tags: [tags.expenses(userId)] }
    ),
    userCalendar(userId),
  ]);

  return json({
    earliestDate,
    dateFormat: cal === "np" ? "nepali" : "english",
  });
});
