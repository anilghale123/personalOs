import { withRoute, json, notFound, badRequest } from "@/lib/api";
import {
  z,
  amountMajor,
  formatZodError,
  objectId,
  text,
  optionalText,
  idempotencyKey,
} from "@/lib/validation";
import { appendOnce } from "@/lib/idempotent";
import { unitsFor } from "@/lib/money";
import SIP from "@/models/SIP";
import { invalidatePortfolio } from "@/lib/cache";

/** A ticker, if the fund is listed. */
const ticker = z
  .string()
  .max(20)
  .transform((s) => s.trim().toUpperCase())
  .optional();

const CreateSIP = z.object({
  fundName: text(120).pipe(z.string().min(1, "Name the fund.")),
  ticker,
  monthlyAmount: amountMajor,
  startDate: z.coerce.date().optional(),
  isActive: z.boolean().optional(),
  note: optionalText(300),
});

const AddInstallment = z.object({
  _id: objectId,
  installment: z.object({
    date: z.coerce.date().optional(),
    amountInvested: amountMajor,
    /**
     * NAV per unit, in rupees as typed → paisa.
     *
     * Optional: someone logging an installment often does not know the NAV
     * on the day, and refusing the entry over it would lose the amount too.
     * Absent means units are simply unknown (recorded as 0) rather than
     * `NaN` — which is exactly what the old code stored and then summed.
     */
    navAtPurchase: amountMajor.optional(),
    idempotencyKey: idempotencyKey.optional(),
  }),
});

/** GET — all SIPs for the current user. */
export const GET = withRoute({ limit: "read" }, async ({ userId }) => {
  const sips = await SIP.find({ userId }).sort({ createdAt: -1 }).lean();
  return json(sips);
});

/**
 * POST — create a SIP, or append an installment to one.
 *
 * Every numeric field now goes through the money layer before it reaches
 * the database. Previously `monthlyAmount`, `amountInvested` and
 * `navAtPurchase` were written straight from the request body with no type,
 * sign or range check — so a negative, a string, or a `NaN` was accepted,
 * and `amountInvested / navAtPurchase` then wrote `NaN` into
 * `unitsPurchased`, silently corrupting every portfolio total that summed
 * it with no way to identify the bad row afterwards.
 *
 * Body (create):      { fundName, ticker?, monthlyAmount, startDate?, note? }
 * Body (installment): { _id, installment: { date?, amountInvested, navAtPurchase, idempotencyKey? } }
 */
export const POST = withRoute({ limit: "write" }, async ({ request, userId }) => {
  let raw;
  try {
    raw = await request.json();
  } catch {
    throw badRequest("Expected a JSON body.");
  }

  // Two shapes on one endpoint, discriminated by the presence of an
  // installment. Parsed separately so each gets its own error messages
  // rather than a union's combined and unreadable ones.
  if (raw?._id && raw?.installment) {
    const parsed = AddInstallment.safeParse(raw);
    if (!parsed.success) throw badRequest(formatZodError(parsed.error));
    const { _id, installment } = parsed.data;

    const { doc, replayed, atCapacity } = await appendOnce(SIP, {
      filter: { _id, userId },
      arrayPath: "installments",
      entry: {
        date: installment.date ?? new Date(),
        amountInvestedPaisa: installment.amountInvested,
        navAtPurchasePaisa: installment.navAtPurchase,
        // Returns 0, never NaN or Infinity, when the NAV is absent or
        // unusable — see the exhaustive guard test in lib/money.test.js.
        unitsScaled: unitsFor(installment.amountInvested, installment.navAtPurchase),
      },
      idempotencyKey: installment.idempotencyKey,
    });

    if (atCapacity) {
      throw badRequest(
        "This plan has reached the maximum number of installments we can store on one record. Start a new plan to carry on."
      );
    }
    if (!doc) throw notFound("SIP not found");

    // After the existence check, so a failed write never clears a good cache.
    invalidatePortfolio(userId);

    return json({ ...doc, replayed });
  }

  const parsed = CreateSIP.safeParse(raw);
  if (!parsed.success) throw badRequest(formatZodError(parsed.error));

  const sip = await SIP.create({
    userId,
    fundName: parsed.data.fundName,
    ticker: parsed.data.ticker,
    monthlyAmountPaisa: parsed.data.monthlyAmount,
    startDate: parsed.data.startDate ?? new Date(),
    isActive: parsed.data.isActive !== false,
  });

  invalidatePortfolio(userId);

  return json(sip, { status: 201 });
});
