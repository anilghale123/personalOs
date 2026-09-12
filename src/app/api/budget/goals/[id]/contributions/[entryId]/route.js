import { withRoute, json, must } from "@/lib/api";
import { pullById } from "@/lib/idempotent";
import { invalidateMoney } from "@/lib/cache";
import FinancialGoal from "@/models/FinancialGoal";

/** DELETE /api/budget/goals/[id]/contributions/[entryId] — undo one deposit. */
export const DELETE = withRoute(
  { limit: "write", params: ["id", "entryId"] },
  async ({ userId, params }) => {
    const goal = must(
      await pullById(FinancialGoal, {
        filter: { _id: params.id, userId },
        arrayPath: "contributions",
        entryId: params.entryId,
      })
    );

    invalidateMoney(userId);

    return json(goal);
  }
);
