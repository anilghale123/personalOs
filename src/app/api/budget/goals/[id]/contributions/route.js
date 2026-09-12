import { withRoute, json, notFound, badRequest } from "@/lib/api";
import {
  z,
  amountMajor,
  dateKey,
  optionalText,
  idempotencyKey,
} from "@/lib/validation";
import { appendOnce } from "@/lib/idempotent";
import { toDateKey } from "@/lib/utils";
import FinancialGoal from "@/models/FinancialGoal";
import { invalidateMoney } from "@/lib/cache";

const ContributionBody = z.object({
  amount: amountMajor,
  date: dateKey.optional(),
  note: optionalText(300),
  /** Optional so an older client still works; sent by ours. */
  idempotencyKey: idempotencyKey.optional(),
});

/**
 * POST /api/budget/goals/[id]/contributions — put money towards a goal.
 *
 * Idempotent: replaying the same `idempotencyKey` returns the goal
 * unchanged with `replayed: true` rather than depositing twice. See
 * lib/idempotent.js for why a guarded `$push` and not a read-then-write.
 *
 * Body: { amount, date?, note?, idempotencyKey? }
 */
export const POST = withRoute(
  {
    limit: "write",
    params: ["id"],
    body: ContributionBody,
  },
  async ({ userId, params, input }) => {
    const { doc, replayed, atCapacity } = await appendOnce(FinancialGoal, {
      // userId in the filter is the ownership check — a goal belonging to
      // someone else is indistinguishable from one that does not exist.
      filter: { _id: params.id, userId },
      arrayPath: "contributions",
      entry: {
        amountPaisa: input.amount,
        date: input.date ?? toDateKey(),
        note: input.note,
      },
      idempotencyKey: input.idempotencyKey,
    });

    if (atCapacity) {
      throw badRequest(
        `This goal has reached the maximum number of contributions we can store on one record. Close it and open a new one to carry on.`
      );
    }
    if (!doc) throw notFound();

    // A deposit changes the goal progress every money view shows.
    invalidateMoney(userId);

    return json({ ...doc, replayed }, { status: replayed ? 200 : 201 });
  }
);
