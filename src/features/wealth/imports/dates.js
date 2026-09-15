/**
 * Dates as banks print them → 'YYYY-MM-DD' (AD).
 *
 *   2026-07-12 · 2026/07/12 · 12/07/2026 · 12-07-26 · 12-Jul-2026 · 12 Jul 2026 ·
 *   Jul 12, 2026 · and Bikram Sambat dates (2083-03-27), converted to AD.
 *
 * Numeric day/month order defaults to DD/MM (the Nepali convention) and only
 * flips when the first number can't be a month. Pure.
 */

import { bsToAd } from "@/lib/nepali-date";

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

/** A year this far ahead of AD is a Bikram Sambat year (BS ≈ AD + 57). */
const BS_YEAR = { min: 2060, max: 2090 };

function pad(n) {
  return String(n).padStart(2, "0");
}

function fullYear(y) {
  const n = Number(y);
  return String(y).length === 2 ? 2000 + n : n;
}

/** Validate and format; converts BS years. */
function toKey(year, month, day) {
  if (!year || !month || !day) return null;
  if (year >= BS_YEAR.min && year <= BS_YEAR.max) return bsToAd(year, month - 1, day);
  if (year < 1990 || month > 12 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

const PATTERNS = [
  {
    // 2026-07-12, 2083/03/27
    re: /(?<!\d)(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/,
    read: (m) => toKey(Number(m[1]), Number(m[2]), Number(m[3])),
  },
  {
    // 12/07/2026, 07/13/2026, 12-07-26
    re: /(?<!\d)(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?!\d)/,
    read: (m) => {
      const a = Number(m[1]);
      const b = Number(m[2]);
      const year = fullYear(m[3]);
      return a <= 12 && b > 12 ? toKey(year, a, b) : toKey(year, b, a);
    },
  },
  {
    // 12-Jul-2026, 12 Jul 26
    re: /(?<![A-Za-z\d])(\d{1,2})[-\s/]([A-Za-z]{3,9})\.?[-\s/,]*(\d{4}|\d{2})(?!\d)/,
    read: (m) => toKey(fullYear(m[3]), MONTHS[m[2].slice(0, 3).toLowerCase()], Number(m[1])),
  },
  {
    // Jul 12, 2026
    re: /(?<![A-Za-z])([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})(?!\d)/,
    read: (m) => toKey(Number(m[3]), MONTHS[m[1].slice(0, 3).toLowerCase()], Number(m[2])),
  },
];

/**
 * The first date in `text`.
 * @param {string} text
 * @returns {{date: string, index: number, end: number}|null}
 */
export function parseStatementDate(text) {
  const s = String(text ?? "");
  let best = null;
  for (const { re, read } of PATTERNS) {
    const m = s.match(re);
    if (!m) continue;
    const date = read(m);
    if (date && (!best || m.index < best.index)) {
      best = { date, index: m.index, end: m.index + m[0].length };
    }
  }
  return best;
}
