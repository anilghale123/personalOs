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
