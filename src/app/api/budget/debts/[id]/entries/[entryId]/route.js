import { withRoute, json, must } from "@/lib/api";
import { pullById } from "@/lib/idempotent";
import { invalidateMoney } from "@/lib/cache";
import Debt from "@/models/Debt";

/** DELETE /api/budget/debts/[id]/entries/[entryId] — undo one ledger line. */
export const DELETE = withRoute(
  { limit: "write", params: ["id", "entryId"] },
  async ({ userId, params }) => {
    // The entry id is in the filter as well as the $pull, so removing an
    // already-removed line is a 404 rather than a silent no-op reported as
    // success — the caller's view of the ledger would otherwise be wrong.
    const debt = must(
      await pullById(Debt, {
        filter: { _id: params.id, userId },
        arrayPath: "entries",
        entryId: params.entryId,
      })
    );

    invalidateMoney(userId);

    return json(debt);
  }
);
