import { withRoute, json, must } from "@/lib/api";
import {
  z,
  amountMajor,
  blankAsAbsent,
  clearableDateKey,
  finiteNumber,
  optionalText,
  text,
} from "@/lib/validation";
import { invalidateMoney } from "@/lib/cache";
import Debt from "@/models/Debt";
import { DEBT_KINDS } from "@/features/budget/constants";

const KINDS = DEBT_KINDS.map((k) => k.id);

const UpdateDebt = z
  .object({
    name: text(80).pipe(z.string().min(1, "A debt name is required.")).optional(),
    kind: z.enum(KINDS).optional(),
    counterparty: optionalText(80),
    principal: amountMajor.optional(),
    // `blankAsAbsent`, not `optionalRate` — on a PATCH an omitted rate must
    // mean "leave it", and a schema that defaults undefined to 0 would zero
    // the rate on every unrelated edit.
    interestRate: blankAsAbsent(finiteNumber(0, 1000)),
    // Three states: absent = leave it, blank = clear it, value = set it.
    dueDate: clearableDateKey,
    note: optionalText(300),
    status: z.enum(["active", "closed"]).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "Nothing to update.",
  });

/**
 * PATCH /api/budget/debts/[id]
 * Body: any subset of { name, kind, counterparty, principal, interestRate,
 *                       dueDate, note, status }
 */
export const PATCH = withRoute(
  { limit: "write", params: ["id"], body: UpdateDebt },
  async ({ userId, params, input }) => {
    const update = {};
    const unset = {};

    if (input.name !== undefined) update.name = input.name;
    if (input.kind !== undefined) update.kind = input.kind;
    if (input.counterparty !== undefined) update.counterparty = input.counterparty;
    if (input.principal !== undefined) update.principalPaisa = input.principal;
    if (input.interestRate !== undefined) update.interestRate = input.interestRate;
    if (input.note !== undefined) update.note = input.note;
    if (input.status !== undefined) update.status = input.status;

    // `$unset`, not `$set: undefined` — Mongoose strips undefined out of
    // `$set`, so clearing a due date that way silently left the old one.
    if (input.dueDate === null) unset.dueDate = "";
    else if (input.dueDate !== undefined) update.dueDate = input.dueDate;

    const debt = must(
      await Debt.findOneAndUpdate(
        { _id: params.id, userId },
        {
          ...(Object.keys(update).length ? { $set: update } : {}),
          ...(Object.keys(unset).length ? { $unset: unset } : {}),
        },
        { new: true, runValidators: true }
      ).lean()
    );

    invalidateMoney(userId);

    return json(debt);
  }
);

/** DELETE /api/budget/debts/[id] — removes the debt and its whole ledger. */
export const DELETE = withRoute(
  { limit: "write", params: ["id"] },
  async ({ userId, params }) => {
    const debt = must(
      await Debt.findOneAndDelete({ _id: params.id, userId }).lean()
    );

    invalidateMoney(userId);

    return json({ ok: true, id: String(debt._id) });
  }
);
