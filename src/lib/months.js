/**
 * Calendar-agnostic month cursors for the monthly expense record.
 *
 * A cursor names one month in one calendar: { cal: 'en'|'np', year,
 * month } with month 0-based. Filtering always happens on AD date keys —
 * a Nepali month cursor just resolves to the AD range it spans — so the
 * expenses API and the stored data never need to know about calendars.
 */

import {
  adToBs,
  bsMonthAdRange,
  bsMonthLabel,
  shiftBsMonth,
} from "./nepali-date";

const EN_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** The month containing today's date key, in the given calendar. */
export function currentMonthCursor(cal, todayKey) {
  return cursorForDateKey(todayKey, cal);
}

/** The month containing a given AD date key, in the given calendar. */
export function cursorForDateKey(dateKey, cal) {
  if (cal === "np") {
    const bs = adToBs(dateKey);
    if (bs) return { cal: "np", year: bs.year, month: bs.month };
    // Outside the BS table — fall back to the English month.
  }
  const [y, m] = dateKey.split("-").map(Number);
  return { cal: "en", year: y, month: m - 1 };
}

/** AD date-key range a cursor covers: { from, to }. */
export function monthCursorRange(cursor) {
  if (cursor.cal === "np") {
    return bsMonthAdRange(cursor.year, cursor.month);
  }
  const lastDay = new Date(Date.UTC(cursor.year, cursor.month + 1, 0)).getUTCDate();
  return {
    from: `${cursor.year}-${pad2(cursor.month + 1)}-01`,
    to: `${cursor.year}-${pad2(cursor.month + 1)}-${pad2(lastDay)}`,
  };
}

/** "August 2026" or "Bhadra 2083". */
export function monthCursorLabel(cursor) {
  if (cursor.cal === "np") return bsMonthLabel(cursor.year, cursor.month);
  return `${EN_MONTHS[cursor.month]} ${cursor.year}`;
}

/** Move a cursor by delta months, staying inside its own calendar. */
export function shiftMonthCursor(cursor, delta) {
  if (cursor.cal === "np") {
    const next = shiftBsMonth(cursor.year, cursor.month, delta);
    return { cal: "np", ...next };
  }
  const d = new Date(Date.UTC(cursor.year, cursor.month + delta, 1));
  return { cal: "en", year: d.getUTCFullYear(), month: d.getUTCMonth() };
}

/** Ordering by real time — cursors compare by their first AD day. */
export function compareMonthCursors(a, b) {
  const fromA = monthCursorRange(a).from;
  const fromB = monthCursorRange(b).from;
  return fromA < fromB ? -1 : fromA > fromB ? 1 : 0;
}

/**
 * If a date range is exactly one calendar month, return its cursor —
 * this is what lets the pager highlight the month a filter range covers.
 * Otherwise null (a custom range).
 */
export function exactMonthCursor(dateFrom, dateTo, cal) {
  if (!dateFrom || !dateTo) return null;
  const cursor = cursorForDateKey(dateFrom, cal);
  const range = monthCursorRange(cursor);
  return range.from === dateFrom && range.to === dateTo ? cursor : null;
}
