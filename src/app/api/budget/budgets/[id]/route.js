import { withRoute, json, must } from "@/lib/api";
import { invalidateMoney } from "@/lib/cache";
import Budget from "@/models/Budget";
import { computeBudgetSummary } from "@/features/budget/summary";

/** DELETE /api/budget/budgets/[id] — remove a budget line entirely. */
export const DELETE = withRoute(
  { limit: "write", params: ["id"] },
  async ({ userId, params }) => {
    // userId in the filter is the ownership check: a line belonging to someone
    // else is indistinguishable from one that does not exist.
    const budget = must(
      await Budget.findOneAndDelete({ _id: params.id, userId }).lean()
    );

    invalidateMoney(userId);

    return json(await computeBudgetSummary(userId, budget.period));
  }
);
