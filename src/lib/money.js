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
