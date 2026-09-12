import { withRoute, json, badRequest } from "@/lib/api";
import {
  z,
  amountMajor,
  dateKey,
  optionalDateKey,
  objectId,
  optionalText,
  tagList,
} from "@/lib/validation";
import { toDateKey } from "@/lib/utils";
import { buildExpenseFilter } from "@/features/budget/expense-filter";
import { cachedMoney, invalidateMoney, tags } from "@/lib/cache";
import Expense from "@/models/Expense";
import Category from "@/models/Category";
import {
  EXPENSE_MAX_PAGE_SIZE,
  EXPENSE_PAGE_SIZE,
  PAYMENT_METHODS,
  RECURRENCE_FREQUENCIES,
} from "@/features/budget/constants";

const PAYMENT_IDS = PAYMENT_METHODS.map((p) => p.id);
const FREQ_IDS = RECURRENCE_FREQUENCIES.map((f) => f.id);

// Shared with the client store and the server action — see the note in
// features/budget/constants.js on why this is defined in one place.
const MAX_LIMIT = EXPENSE_MAX_PAGE_SIZE;
const DEFAULT_LIMIT = EXPENSE_PAGE_SIZE;

const SORTS = {
  date_desc: { date: -1, createdAt: -1 },
  date_asc: { date: 1, createdAt: 1 },
  amount_desc: { amountPaisa: -1 },
  amount_asc: { amountPaisa: 1 },
};

const ListQuery = z.object({
  categoryId: objectId.optional(),
  paymentMethod: z.enum(PAYMENT_IDS).optional(),
  dateFrom: dateKey.optional(),
  dateTo: dateKey.optional(),
  tag: z.string().max(40).optional(),
  q: z.string().max(64).optional(),
  sort: z.enum(Object.keys(SORTS)).catch("date_desc"),
  limit: z.coerce.number().int().positive().max(MAX_LIMIT).catch(DEFAULT_LIMIT),
  skip: z.coerce.number().int().min(0).max(100_000).catch(0),
});

/**
 * GET /api/budget/expenses — a page of expenses plus totals for the filter.
 *
 * Paginated, and the total comes from an aggregation rather than from summing
 * the rows in JavaScript. Previously this returned *every* matching expense
 * and totalled them in the handler, so the response grew without bound and a
 * heavy user's filter change shipped megabytes per keystroke.
 *
 * The count and total are one `$group` over the same filter, so they describe
 * the whole filtered set while only one page of documents is returned.
 *
 * Query: categoryId, paymentMethod, dateFrom, dateTo, tag, q, sort, limit, skip
 */
export const GET = withRoute(
  { limit: "read", query: ListQuery },
  async ({ userId, query }) => {
    const filter = buildExpenseFilter(userId, query);

    const [expenses, aggregate, earliest] = await Promise.all([
      Expense.find(filter)
        .sort(SORTS[query.sort])
        .skip(query.skip)
        .limit(query.limit)
        .lean(),

      // Total and count for the *entire* filtered set, computed in Mongo.
      Expense.aggregate([
        { $match: buildExpenseFilter(userId, query, { forAggregation: true }) },
        {
          $group: {
            _id: null,
            totalPaisa: { $sum: "$amountPaisa" },
            count: { $sum: 1 },
          },
        },
      ]),

      // The oldest record on file regardless of filters — the monthly record
      // pager needs to know how far back it can go. Cached separately because
      // it only changes when the user's very first expense changes.
      cachedMoney(
        async () => {
          const doc = await Expense.findOne({ userId, deletedAt: null })
            .sort({ date: 1 })
            .select("date")
            .lean();
          return doc?.date ?? null;
        },
        {
          userId,
          key: "earliest-expense",
          tags: [tags.expenses(userId)],
        }
      ),
    ]);

    const totalPaisa = aggregate[0]?.totalPaisa ?? 0;
    const matchCount = aggregate[0]?.count ?? 0;

    return json({
      expenses,
      totalPaisa,
      // Pagination metadata, matching the shape the journal routes already
      // use so client code can share one helper.
      count: matchCount,
      limit: query.limit,
      skip: query.skip,
      hasMore: query.skip + expenses.length < matchCount,
      earliestDate: earliest,
    });
  }
);

const CreateExpense = z.object({
  amount: amountMajor,
  categoryId: objectId,
  date: optionalDateKey,
  note: optionalText(500),
  paymentMethod: z.enum(PAYMENT_IDS).optional(),
  tags: tagList.optional(),
  isRecurring: z.boolean().optional(),
  recurrence: z
    .object({
      frequency: z.enum(FREQ_IDS),
      dayOfMonth: z.coerce.number().int().min(1).max(31).optional(),
      weekday: z.coerce.number().int().min(0).max(6).optional(),
      nextRunDate: dateKey.optional(),
    })
    .optional(),
});

/**
 * POST /api/budget/expenses — create an expense.
 *
 * The primary "fast" flow needs only amount + categoryId.
 *
 * Body: { amount, categoryId, date?, note?, paymentMethod?, tags?,
 *         isRecurring?, recurrence? }
 */
export const POST = withRoute(
  { limit: "write", body: CreateExpense },
  async ({ userId, input }) => {
    if (input.isRecurring && !input.recurrence) {
      throw badRequest(
        "A recurring expense needs a repeat frequency."
      );
    }

    // Ownership check on the category: scoping the lookup by userId means a
    // category id belonging to someone else reads as simply not existing.
    const category = await Category.findOne({
      _id: input.categoryId,
      userId,
    })
      .select("_id")
      .lean();
    if (!category) throw badRequest("Category not found.");

    const expense = await Expense.create({
      userId,
      amountPaisa: input.amount,
      currency: "NPR",
      categoryId: input.categoryId,
      date: input.date ?? toDateKey(),
      note: input.note,
      paymentMethod: input.paymentMethod || "cash",
      tags: input.tags ?? [],
      isRecurring: Boolean(input.isRecurring),
      recurrence: input.isRecurring ? input.recurrence : undefined,
    });

    // Same request as the write, so the client's next read cannot see a
    // stale total. See the tier note in lib/cache.js.
    invalidateMoney(userId);

    return json(expense, { status: 201 });
  }
);
