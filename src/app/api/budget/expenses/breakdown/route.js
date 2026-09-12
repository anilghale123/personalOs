import { withRoute, json } from "@/lib/api";
import { z, dateKey, objectId } from "@/lib/validation";
import { buildExpenseFilter } from "@/features/budget/expense-filter";
import { cachedMoney, tags } from "@/lib/cache";
import { PAYMENT_METHODS } from "@/features/budget/constants";
import Expense from "@/models/Expense";

const PAYMENT_IDS = PAYMENT_METHODS.map((p) => p.id);

const BreakdownQuery = z.object({
  categoryId: objectId.optional(),
  paymentMethod: z.enum(PAYMENT_IDS).optional(),
  dateFrom: dateKey.optional(),
  dateTo: dateKey.optional(),
  tag: z.string().max(40).optional(),
  q: z.string().max(64).optional(),
});

/**
 * GET /api/budget/expenses/breakdown — spend per category for a filter set.
 *
 * This exists because pagination broke the old approach. The filter panel used
 * to fetch the expense list and sum it per category in the browser, which was
 * correct only while the list route returned *every* matching row. Once it
 * returned a page of 50, the breakdown silently described the first 50
 * expenses rather than the month — wrong numbers, with nothing to indicate it.
 *
 * Aggregating in Mongo also means the breakdown no longer costs a full
 * document transfer to compute a handful of sums.
 *
 * Query: same filters as the list route.
 */
export const GET = withRoute(
  { limit: "read", query: BreakdownQuery },
  async ({ userId, query }) => {
    const rows = await cachedMoney(
      () =>
        Expense.aggregate([
          { $match: buildExpenseFilter(userId, query, { forAggregation: true }) },
          {
            $group: {
              _id: "$categoryId",
              totalPaisa: { $sum: "$amountPaisa" },
              count: { $sum: 1 },
            },
          },
          { $sort: { totalPaisa: -1 } },
          // A breakdown nobody reads past the twentieth row.
          { $limit: 50 },
        ]),
      {
        userId,
        key: "expense-breakdown",
        deps: [
          query.paymentMethod ?? "",
          query.dateFrom ?? "",
          query.dateTo ?? "",
          query.tag ?? "",
          query.q ?? "",
        ],
        tags: [tags.expenses(userId), tags.money(userId)],
      }
    );

    const totalPaisa = rows.reduce((sum, r) => sum + r.totalPaisa, 0);

    return json({
      rows: rows.map((r) => ({
        categoryId: r._id ? String(r._id) : null,
        totalPaisa: r.totalPaisa,
        count: r.count,
      })),
      totalPaisa,
    });
  }
);
