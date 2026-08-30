/**
 * Bikram Sambat (Nepali) calendar conversion — pure date-key arithmetic,
 * no Date timezone traps: everything works on 'YYYY-MM-DD' strings and
 * UTC-midnight math, so AD↔BS mapping is identical in every timezone.
 *
 * The BS calendar is not algorithmic — the number of days in each month
 * is published per year by the Nepali calendar authorities — so the
 * table below is data, covering BS 2000–2090 (AD 1943–2034).
 *
 * Anchor: BS 2000-01-01 = AD 1943-04-14.
 */

export const BS_MIN_YEAR = 2000;
export const BS_MAX_YEAR = 2090;

/** Transliterated month names — index 0 is Baisakh. */
export const BS_MONTHS = [
  "Baisakh",
  "Jestha",
  "Ashadh",
  "Shrawan",
  "Bhadra",
  "Ashwin",
  "Kartik",
  "Mangsir",
  "Poush",
  "Magh",
  "Falgun",
  "Chaitra",
];

/** Days in each of the 12 months, one row per BS year from 2000 on. */
const BS_YEAR_DAYS = [
  [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 29, 31],
  [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30],
  [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30],
  [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  [31, 32, 31, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  [31, 31, 32, 31, 32, 30, 30, 29, 30, 29, 30, 30],
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  [30, 32, 31, 32, 31, 31, 29, 30, 30, 29, 29, 31],
  [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30],
  [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30],
  [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  [31, 32, 31, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  [31, 31, 32, 31, 32, 30, 30, 29, 30, 29, 30, 30],
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  [30, 32, 31, 32, 31, 31, 29, 30, 29, 30, 29, 31],
  [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 29, 31],
  [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30],
  [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  [31, 32, 31, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  [31, 31, 32, 31, 31, 31, 30, 30, 29, 30, 30, 30],
  [30, 31, 32, 32, 30, 31, 30, 30, 29, 30, 30, 30],
  [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30],
  [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30],
];

/** Cumulative days before each BS year (index 0 = year 2000). */
const YEAR_START = (() => {
  const out = [];
  let acc = 0;
  for (const row of BS_YEAR_DAYS) {
    out.push(acc);
    acc += row.reduce((a, b) => a + b, 0);
  }
  return out;
})();

const DAY_MS = 86_400_000;
/** Date.UTC of the day before the BS epoch — day 1 of the count is 2000-01-01. */
const EPOCH_UTC = Date.UTC(1943, 3, 13);

function pad2(n) {
  return String(n).padStart(2, "0");
}

function keyToUtc(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function utcToKey(utc) {
  const d = new Date(utc);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/**
 * AD date key → BS { year, month (0-based), day }. Returns null outside
 * the table's range (before 1943-04-14 or after BS 2090 ends).
 */
export function adToBs(dateKey) {
  const daysPassed = Math.round((keyToUtc(dateKey) - EPOCH_UTC) / DAY_MS);
  if (daysPassed < 1) return null;

  let year = BS_MIN_YEAR;
  while (
    year <= BS_MAX_YEAR &&
    daysPassed > YEAR_START[year - BS_MIN_YEAR] + yearDays(year)
  ) {
    year++;
  }
  if (year > BS_MAX_YEAR) return null;

  let remainder = daysPassed - YEAR_START[year - BS_MIN_YEAR];
  const months = BS_YEAR_DAYS[year - BS_MIN_YEAR];
  let month = 0;
  while (remainder > months[month]) {
    remainder -= months[month];
    month++;
  }
  return { year, month, day: remainder };
}

/** BS date → AD date key, or null outside the table's range. */
export function bsToAd(year, month, day) {
  if (year < BS_MIN_YEAR || year > BS_MAX_YEAR) return null;
  const months = BS_YEAR_DAYS[year - BS_MIN_YEAR];
  if (month < 0 || month > 11 || day < 1 || day > months[month]) return null;
  let daysPassed = YEAR_START[year - BS_MIN_YEAR] + day;
  for (let m = 0; m < month; m++) daysPassed += months[m];
  return utcToKey(EPOCH_UTC + daysPassed * DAY_MS);
}

/** Total days in a BS year. */
export function yearDays(year) {
  const row = BS_YEAR_DAYS[year - BS_MIN_YEAR];
  return row ? row.reduce((a, b) => a + b, 0) : 0;
}

/** Days in a BS month (month is 0-based). */
export function bsMonthDays(year, month) {
  return BS_YEAR_DAYS[year - BS_MIN_YEAR]?.[month] ?? 0;
}

/**
 * The AD date keys a BS month spans — what a month-view filter needs.
 * @returns {{from: string, to: string}}
 */
export function bsMonthAdRange(year, month) {
  return {
    from: bsToAd(year, month, 1),
    to: bsToAd(year, month, bsMonthDays(year, month)),
  };
}

/** The BS month containing an AD date key: { year, month }. */
export function bsMonthOf(dateKey) {
  const bs = adToBs(dateKey);
  return bs ? { year: bs.year, month: bs.month } : null;
}

/** Shift a BS { year, month } by delta months, clamped to the table. */
export function shiftBsMonth(year, month, delta) {
  let y = year;
  let m = month + delta;
  while (m > 11) {
    m -= 12;
    y++;
  }
  while (m < 0) {
    m += 12;
    y--;
  }
  if (y < BS_MIN_YEAR) return { year: BS_MIN_YEAR, month: 0 };
  if (y > BS_MAX_YEAR) return { year: BS_MAX_YEAR, month: 11 };
  return { year: y, month: m };
}

/** "Bhadra 2083" */
export function bsMonthLabel(year, month) {
  return `${BS_MONTHS[month]} ${year}`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Tue, 30 Bhadra 2083" — the BS counterpart of lib/utils formatDate. */
export function formatBsDate(dateKey) {
  const bs = adToBs(dateKey);
  if (!bs) return dateKey;
  const weekday = WEEKDAYS[new Date(keyToUtc(dateKey)).getUTCDay()];
  return `${weekday}, ${bs.day} ${BS_MONTHS[bs.month]} ${bs.year}`;
}
