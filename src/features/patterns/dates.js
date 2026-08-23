/**
 * Pure calendar arithmetic on 'YYYY-MM-DD' date keys.
 *
 * Every function here treats a key as a plain calendar date with no
 * timezone attached, by doing its arithmetic at UTC midnight and never
 * exposing a `Date`. That makes the results identical in Kathmandu and in
 * a Vercel container running UTC — which is the whole point, because the
 * signal layer joins five collections on these keys.
 *
 * `toDateKey()` in `lib/utils.js` converts a real timestamp to a key using
 * the *local* calendar. That is the correct tool for `Transaction.transactionDate`
 * and friends, and it is deliberately not re-implemented here.
 */

const MS_PER_DAY = 86_400_000;

/** True for a well-formed 'YYYY-MM-DD' string. */
export function isDateKey(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Milliseconds at UTC midnight of a date key. Internal arithmetic base. */
function msOf(key) {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Format a UTC-midnight millisecond value back to a date key. */
function keyOf(ms) {
  const d = new Date(ms);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** The date key `n` calendar days after `key` (negative goes backwards). */
export function addDays(key, n) {
  return keyOf(msOf(key) + n * MS_PER_DAY);
}

/** Calendar days from `from` to `to`. Negative when `to` is earlier. */
export function dayDiff(from, to) {
  return Math.round((msOf(to) - msOf(from)) / MS_PER_DAY);
}

/** Every date key from `from` to `to` inclusive, ascending. */
export function dateKeyRange(from, to) {
  const span = dayDiff(from, to);
  if (span < 0) return [];
  const out = new Array(span + 1);
  for (let i = 0; i <= span; i++) out[i] = addDays(from, i);
  return out;
}

/** Day of week, 0 = Monday … 6 = Sunday — matching `weekStartsOn: 1`. */
export function dowIndex(key) {
  return (new Date(msOf(key)).getUTCDay() + 6) % 7;
}

/** True for Saturday and Sunday. */
export function isWeekendKey(key) {
  return dowIndex(key) >= 5;
}

/** Day of the month, 1–31. */
export function dayOfMonth(key) {
  return Number(key.slice(8, 10));
}

/** The Monday that starts this key's week — the `weekStart` form. */
export function mondayOfKey(key) {
  return addDays(key, -dowIndex(key));
}

/**
 * A date key as the UTC-midnight `Date` that `HabitLog.date` stores.
 *
 * `POST /api/compass/habits` writes `new Date(\`${dateStr}T00:00:00.000Z\`)`
 * and the heatmap reads it back with `.toISOString().split("T")[0]`. That
 * round-trip is correct as long as both ends stay in UTC — so range
 * queries against `HabitLog` must be built with this, never with a local
 * midnight.
 */
export function utcMidnightFromKey(key) {
  return new Date(`${key}T00:00:00.000Z`);
}

/**
 * The inverse: a `HabitLog.date` back to its date key.
 *
 * Deliberately `toISOString()`, not `toDateKey()`. Applying the local
 * conversion to a UTC-midnight value in Nepal (UTC+05:45) yields the
 * previous day, which would shift every habit one day out of alignment
 * with the expenses and journals it is being correlated against.
 */
export function dateKeyFromUtcMidnight(value) {
  if (isDateKey(value)) return value;
  const d = value instanceof Date ? value : new Date(value);
  return d.toISOString().split("T")[0];
}
