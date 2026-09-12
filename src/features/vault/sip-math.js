/**
 * SIP figures, read compatibly across the paisa migration.
 *
 * Every accessor prefers the integer-paisa field and falls back to the
 * legacy float one, so a half-migrated collection reads correctly and the
 * UI needs no knowledge of which representation a given document uses.
 * Once scripts/migrate-vault-to-paisa.mjs has run everywhere and the
 * deprecated fields are dropped, the fallbacks come out.
 *
 * Pure functions only — safe to import from client components.
 */

import { toMinorUnits, toScaledUnits, UNIT_SCALE } from "@/lib/money";

/** Monthly commitment, in paisa. */
export function monthlyPaisa(sip) {
  if (Number.isFinite(sip?.monthlyAmountPaisa)) return sip.monthlyAmountPaisa;
  return toMinorUnits(sip?.monthlyAmount);
}

/** One installment's invested amount, in paisa. */
export function installmentPaisa(installment) {
  if (Number.isFinite(installment?.amountInvestedPaisa)) {
    return installment.amountInvestedPaisa;
  }
  return toMinorUnits(installment?.amountInvested);
}

/** One installment's units, as a scaled integer. */
export function installmentUnits(installment) {
  if (Number.isFinite(installment?.unitsScaled)) return installment.unitsScaled;
  // A legacy NaN `unitsPurchased` — the bug this migration closes — becomes
  // 0 here rather than propagating into a total.
  return toScaledUnits(installment?.unitsPurchased);
}

/**
 * What has actually been paid into a SIP, in paisa.
 *
 * Summed from the installment ledger, never from the schedule: a missed or
 * partial month makes `monthlyAmount × months` an overstatement, and this
 * figure is labelled to the user as money they have really invested.
 */
export function investedPaisa(sip) {
  return (sip?.installments ?? []).reduce(
    (sum, i) => sum + installmentPaisa(i),
    0
  );
}

/** Total units held in a SIP, as a scaled integer. */
export function unitsHeld(sip) {
  return (sip?.installments ?? []).reduce(
    (sum, i) => sum + installmentUnits(i),
    0
  );
}

/**
 * What the schedule *says* should have been invested by now, in paisa.
 *
 * Deliberately separate from `investedPaisa` and must stay separately
 * labelled in the UI — it is a projection, and presenting it as invested
 * money would overstate every plan with a missed month.
 */
export function projectedPaisa(sip, monthsActive) {
  return monthlyPaisa(sip) * Math.max(0, monthsActive);
}

/** Average cost per unit, in paisa — 0 when nothing is held yet. */
export function averageCostPaisa(sip) {
  const units = unitsHeld(sip);
  if (!units) return 0;
  return Math.round((investedPaisa(sip) * UNIT_SCALE) / units);
}
