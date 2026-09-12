import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind class names without conflicts.
 * @param {...any} inputs
 * @returns {string}
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Format a number as NPR currency.
 * @param {number} value
 * @returns {string}
 */
export function formatNPR(value) {
  const n = Number(value) || 0;
  return `NPR ${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

/**
 * Format a number with thousands separators.
 * @param {number} value
 */
export function formatNumber(value) {
  return (Number(value) || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  });
}

/**
 * Returns a 'YYYY-MM-DD' string for a given Date using its **local**
 * calendar date (defaults to today).
 *
 * This must not use toISOString(), which is UTC — in timezones ahead of
 * UTC (e.g. Nepal, UTC+5:45) that shifts the date a day off, so the
 * calendar would highlight the wrong "today".
 * @param {Date} [d]
 */
export function toDateKey(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Human-friendly date label.
 * @param {string|Date} d
 */
export function formatDate(d) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(d));
}

/**
 * Escape a user-supplied string for safe use inside a `RegExp`.
 *
 * Two separate bugs live in an unescaped `$regex`: an unbalanced `(` or a
 * bare `?` throws and surfaces as a 500, and a crafted pattern like
 * `(a+)+$` backtracks catastrophically and pins a CPU. Every search route
 * that builds a regex from user input must go through here.
 * @param {string} s
 */
export function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Longest search term we will compile into a regex. */
export const MAX_SEARCH_LENGTH = 64;

/**
 * A case-insensitive "contains" matcher for a user-typed term, or `null`
 * when the term is too short to be worth querying.
 * @param {string} term
 * @param {number} [minLength]
 * @returns {RegExp|null}
 */
export function searchRegex(term, minLength = 1) {
  const q = String(term ?? "").trim().slice(0, MAX_SEARCH_LENGTH);
  if (q.length < minLength) return null;
  return new RegExp(escapeRegex(q), "i");
}
