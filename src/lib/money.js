/**
 * All budgeting money math lives here — nowhere else should add,
 * divide or format amounts. Amounts are stored as integer paisa
 * (1 NPR = 100 paisa) so nothing ever rounds through a float.
 */

const MINOR_PER_MAJOR = 100;

/** Convert a user-entered rupee amount (e.g. "450.50") to integer paisa. */
export function toMinorUnits(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * MINOR_PER_MAJOR);
}

/** Convert integer paisa back to a rupee number for display/inputs. */
export function fromMinorUnits(minor) {
  return (Number(minor) || 0) / MINOR_PER_MAJOR;
}

/** Format integer paisa as a currency string, e.g. "NPR 4,250". */
export function formatMoney(minor, currency = "NPR") {
  const value = fromMinorUnits(minor);
  return `${currency} ${value.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;
}

/** Sum a list of items' minor-unit amounts (defaults to `amountPaisa`). */
export function sumMinor(items, selector = (item) => item.amountPaisa) {
  return items.reduce((sum, item) => sum + (Number(selector(item)) || 0), 0);
}

/** Add any number of minor-unit amounts safely (nullish → 0). */
export function addMinor(...values) {
  return values.reduce((sum, v) => sum + (Number(v) || 0), 0);
}

/** Percentage of `whole` that `part` represents, one decimal place, safe on 0. */
export function percentOf(part, whole) {
  if (!whole) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

/* ------------------------------------------------------------------ */
/* Fund / share units                                                  */
/* ------------------------------------------------------------------ */

/**
 * Units are scaled by 10⁴ and stored as integers.
 *
 * Unlike money, units are *irreducibly* fractional: `amountInvested / nav`
 * almost never divides evenly, so no integer representation is exact. What
 * we can control is where the rounding happens — once, here, at the point
 * the number enters the system, rather than accumulating silently through
 * every subsequent multiplication and sum. Four decimal places matches how
 * Nepali mutual funds quote unit holdings.
 */
export const UNIT_SCALE = 10_000;

/** A unit count (possibly fractional) → scaled integer. */
export function toScaledUnits(units) {
  const n = Number(units);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * UNIT_SCALE);
}

/** Scaled integer units → a number for display. */
export function fromScaledUnits(scaled) {
  return (Number(scaled) || 0) / UNIT_SCALE;
}

/**
 * Units bought for `amountPaisa` at `navPaisa` per unit, as a scaled
 * integer.
 *
 * Returns 0 rather than `NaN` or `Infinity` on a zero or non-finite NAV.
 * This is the exact line that used to poison portfolio totals: a missing
 * NAV produced `amountInvested / undefined` → `NaN`, which was stored and
 * then summed into every holding figure with no way to tell afterwards
 * which total was real.
 */
export function unitsFor(amountPaisa, navPaisa) {
  const amount = Number(amountPaisa);
  const nav = Number(navPaisa);
  if (!Number.isFinite(amount) || !Number.isFinite(nav) || nav <= 0) return 0;
  return Math.round((amount / nav) * UNIT_SCALE);
}

/** Format scaled units for display, trimming trailing zeros. */
export function formatUnits(scaled) {
  const value = fromScaledUnits(scaled);
  return value.toLocaleString("en-IN", { maximumFractionDigits: 4 });
}

/**
 * Value of a holding: scaled units at a paisa price, back to paisa.
 * Rounded to whole paisa because that is what money is.
 */
export function holdingValuePaisa(unitsScaled, pricePaisa) {
  const units = Number(unitsScaled);
  const price = Number(pricePaisa);
  if (!Number.isFinite(units) || !Number.isFinite(price)) return 0;
  return Math.round((units * price) / UNIT_SCALE);
}
