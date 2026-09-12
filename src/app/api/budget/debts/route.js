import { withRoute, json } from "@/lib/api";
import {
  z,
  amountMajor,
  optionalRate,
  optionalDateKey,
  optionalText,
  text,
} from "@/lib/validation";
import { invalidateMoney } from "@/lib/cache";
import Debt from "@/models/Debt";
import { DEBT_KINDS } from "@/features/budget/constants";

const KINDS = DEBT_KINDS.map((k) => k.id);

/** GET /api/budget/debts — every debt for the current user, open ones first. */
export const GET = withRoute({ limit: "read" }, async ({ userId }) => {
  const debts = await Debt.find({ userId })
    .sort({ status: 1, createdAt: -1 })
    .lean();
  return json(debts);
});

const CreateDebt = z.object({
  name: text(80).pipe(z.string().min(1, "A debt name is required.")),
  kind: z.enum(KINDS).optional(),
  counterparty: optionalText(80),
  principal: amountMajor,
  // An annual percentage, so bounded rather than merely "a number".
  // Blank means zero interest / no due date, not a malformed request.
  interestRate: optionalRate,
  dueDate: optionalDateKey,
  note: optionalText(300),
});

/**
 * POST /api/budget/debts — record a new debt.
 * Body: { name, kind?, counterparty?, principal, interestRate?, dueDate?, note? }
 */
export const POST = withRoute(
  { limit: "write", body: CreateDebt },
  async ({ userId, input }) => {
    const debt = await Debt.create({
      userId,
      name: input.name,
      kind: input.kind || "owe",
      counterparty: input.counterparty,
      principalPaisa: input.principal,
      interestRate: input.interestRate ?? 0,
      dueDate: input.dueDate,
      note: input.note,
    });

    invalidateMoney(userId);

    return json(debt, { status: 201 });
  }
);
