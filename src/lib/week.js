import { startOfWeek, endOfWeek, format } from "date-fns";

/** Monday-anchored week boundaries for a given date (defaults to now). */
export function weekRange(date = new Date()) {
  const weekStart = startOfWeek(date, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(date, { weekStartsOn: 1 });
  return { weekStart, weekEnd };
}

/** 'YYYY-MM-DD' key for the Monday that starts the given date's week. */
export function weekStartKey(date = new Date()) {
  return format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd");
}

/** Human label like "May 12 – May 18, 2025". */
export function weekLabel(date = new Date()) {
  const { weekStart, weekEnd } = weekRange(date);
  return `${format(weekStart, "MMM d")} – ${format(
    weekEnd,
    "MMM d, yyyy"
  )}`;
}
