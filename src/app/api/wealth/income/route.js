import mongoose from "mongoose";
import { withRoute, json } from "@/lib/api";
import { z, amountMajor, dateKey, optionalDateKey, optionalText, pagination } from "@/lib/validation";
import { toDateKey } from "@/lib/utils";
import { invalidateMoney } from "@/lib/cache";
import { toIncomeDTO } from "@/features/budget/dto";
import { ENTRY_SOURCES, INCOME_CATEGORIES, INCOME_PAGE_SIZE } from "@/features/wealth/constants";
import Income from "@/models/Income";

const ListQuery = pagination(INCOME_PAGE_SIZE, 100).extend({
  dateFrom: dateKey.optional().catch(undefined),
  dateTo: dateKey.optional().catch(undefined),
});

/**
 * GET /api/wealth/income — a page of income, newest first, optionally within
 * a date range (the same month the expense list is showing).
 *
 * Query: dateFrom?, dateTo?, limit, skip  →  { items, total, totalPaisa }
 * `total` and `totalPaisa` describe the whole range, not just the page.
 */
export const GET = withRoute(
  { limit: "read", query: ListQuery },
  async ({ userId, query }) => {
    const dateRange = {};
    if (query.dateFrom) dateRange.$gte = query.dateFrom;
    if (query.dateTo) dateRange.$lte = query.dateTo;
    const inRange = Object.keys(dateRange).length ? { date: dateRange } : {};
    const filter = { userId, deletedAt: null, ...inRange };
    const [items, aggregate] = await Promise.all([
      Income.find(filter)
        .select(toIncomeDTO.fields.join(" "))
        .sort({ date: -1, createdAt: -1 })
        .skip(query.skip)
        .limit(query.limit)
        .lean(),
      Income.aggregate([
        // Aggregation skips Mongoose casting, so the id is cast by hand.
        { $match: { userId: new mongoose.Types.ObjectId(userId), deletedAt: null, ...inRange } },
        { $group: { _id: null, total: { $sum: 1 }, totalPaisa: { $sum: "$amountPaisa" } } },
      ]),
    ]);

    return json({
      items: items.map(toIncomeDTO),
      total: aggregate[0]?.total ?? 0,
      totalPaisa: aggregate[0]?.totalPaisa ?? 0,
    });
  }
);

const CreateIncome = z.object({
  amount: amountMajor,
  category: z.enum(INCOME_CATEGORIES).optional(),
  date: optionalDateKey,
  note: optionalText(500),
  source: z.enum(ENTRY_SOURCES).optional(),
});

/**
 * POST /api/wealth/income — record money in.
 *
 * Body: { amount, category?, date?, note?, source? }  →  201 income DTO
 */
export const POST = withRoute(
  { limit: "write", body: CreateIncome },
  async ({ userId, input }) => {
    const doc = await Income.create({
      userId,
      amountPaisa: input.amount,
      category: input.category ?? "Other",
      date: input.date ?? toDateKey(),
      note: input.note,
      source: input.source ?? "manual",
    });

    invalidateMoney(userId);
    return json(toIncomeDTO(doc.toObject()), { status: 201 });
  }
);
