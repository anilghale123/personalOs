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
import Debt from "@/models/Debt";
import { DEBT_ENTRY_TYPES } from "@/features/budget/constants";
import { invalidateMoney } from "@/lib/cache";

const TYPES = DEBT_ENTRY_TYPES.map((t) => t.id);

const EntryBody = z.object({
  type: z.enum(TYPES, { message: "Choose a valid entry type." }),
  amount: amountMajor,
  date: dateKey.optional(),
  note: optionalText(300),
  idempotencyKey: idempotencyKey.optional(),
});

/**
 * POST /api/budget/debts/[id]/entries — log a repayment or extra borrowing.
 *
 * Idempotent on `idempotencyKey`: a retried request returns the debt
 * unchanged rather than recording the same repayment twice, which would
 * have silently understated the balance with no way to detect it later.
 *
 * Body: { type, amount, date?, note?, idempotencyKey? }
 */
export const POST = withRoute(
  {
    limit: "write",
    params: ["id"],
    body: EntryBody,
  },
  async ({ userId, params, input }) => {
    const { doc, replayed, atCapacity } = await appendOnce(Debt, {
      filter: { _id: params.id, userId },
      arrayPath: "entries",
      entry: {
        type: input.type,
        amountPaisa: input.amount,
        date: input.date ?? toDateKey(),
        note: input.note,
      },
      idempotencyKey: input.idempotencyKey,
    });

    if (atCapacity) {
      throw badRequest(
        `This debt has reached the maximum number of repayments we can store on one record. Close it and open a new one to carry on.`
      );
    }
    if (!doc) throw notFound();

    // A repayment changes the derived balance every money view shows.
    invalidateMoney(userId);

    return json({ ...doc, replayed }, { status: replayed ? 200 : 201 });
  }
);
