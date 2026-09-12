import { withRoute, json, badRequest } from "@/lib/api";
import { z, objectId } from "@/lib/validation";
import { toMinorUnits } from "@/lib/money";
import { invalidateMoney } from "@/lib/cache";
import Budget from "@/models/Budget";
import Category from "@/models/Category";
import { computeBudgetSummary, userCalendar } from "@/features/budget/summary";
import { budgetPeriodRange } from "@/features/budget/utils";
import { BUDGET_PERIODS } from "@/features/budget/constants";

const PERIODS = BUDGET_PERIODS.map((p) => p.id);

/**
 * GET /api/budget/budgets?period=monthly
 * Budget limits for the current period alongside what's actually been spent.
 */
export const GET = withRoute(
  {
    limit: "read",
    query: z.object({ period: z.enum(PERIODS).catch("monthly") }),
  },
  async ({ userId, query }) => {
    return json(await computeBudgetSummary(userId, query.period));
  }
);

/**
 * A budget amount. Unlike every other money field this may legitimately be
 * **zero** — zero is how the UI clears a line — so it does not use the shared
 * `amountMajor`, which rejects zero as a typo.
 */
const budgetAmount = z
  .union([z.number(), z.string()])
  .transform((v, ctx) => {
    const n = typeof v === "string" ? Number(v.trim()) : v;
    if (!Number.isFinite(n) || n < 0) {
      ctx.addIssue({ code: "custom", message: "Enter a valid amount." });
      return z.NEVER;
    }
    const paisa = toMinorUnits(n);
    if (paisa > 1_000_000_000_000) {
      ctx.addIssue({ code: "custom", message: "That amount is out of range." });
      return z.NEVER;
    }
    return paisa;
  });

const SetBudget = z
  .object({
    period: z.enum(PERIODS),
    scope: z.enum(["total", "category"]),
    categoryId: objectId.optional(),
    amount: budgetAmount,
    carryForward: z.boolean().optional(),
  })
  .refine((v) => v.scope !== "category" || Boolean(v.categoryId), {
    message: "A category is required for a category budget.",
    path: ["categoryId"],
  });

/**
 * PUT /api/budget/budgets — set (or clear) one budget line for the current period.
 * Body: { period, scope, categoryId?, amount, carryForward? }
 * An amount of 0 removes the line.
 */
export const PUT = withRoute(
  { limit: "write", body: SetBudget },
  async ({ userId, input }) => {
    if (input.scope === "category") {
      const category = await Category.findOne({
        _id: input.categoryId,
        userId,
      })
        .select("_id")
        .lean();
      if (!category) throw badRequest("Category not found.");
    }

    const cal = await userCalendar(userId);
    const { start } = budgetPeriodRange(input.period, new Date(), cal);
    const filter = {
      userId,
      period: input.period,
      periodStart: start,
      scope: input.scope,
      categoryId: input.scope === "category" ? input.categoryId : null,
    };

    if (input.amount === 0) {
      // Clearing must also stop any earlier budget from carrying into this
      // period, otherwise the old limit would silently reappear.
      await Budget.deleteOne(filter);
      await Budget.updateMany(
        { ...filter, periodStart: { $lt: start } },
        { $set: { carryForward: false } }
      );
    } else {
      await Budget.findOneAndUpdate(
        filter,
        {
          $set: {
            amountPaisa: input.amount,
            carryForward: input.carryForward !== false,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    // Before recomputing, so the summary below is built fresh rather than
    // served from the entry this write just made stale.
    invalidateMoney(userId);

    return json(await computeBudgetSummary(userId, input.period, { cal }));
  }
);
