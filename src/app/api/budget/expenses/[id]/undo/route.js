import { withRoute, json, must } from "@/lib/api";
import { invalidateMoney } from "@/lib/cache";
import { toExpenseDTO } from "@/features/budget/dto";
import Expense from "@/models/Expense";

/** POST /api/budget/expenses/[id]/undo — restores a soft-deleted expense. */
export const POST = withRoute(
  { limit: "write", params: ["id"] },
  async ({ userId, params }) => {
    const expense = must(
      await Expense.findOneAndUpdate(
        { _id: params.id, userId },
        { $set: { deletedAt: null } },
        { new: true }
      ).lean()
    );

    // Restoring changes every total the expense contributes to.
    invalidateMoney(userId);

    return json(toExpenseDTO(expense));
  }
);
