import {
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  format,
} from "date-fns";
import { weekRange } from "@/lib/week";

/** 'YYYY-MM-DD' start/end for the given period, anchored at `date` (defaults to now). */
export function periodRange(period, date = new Date()) {
  if (period === "week") {
    const { weekStart, weekEnd } = weekRange(date);
    return { start: format(weekStart, "yyyy-MM-dd"), end: format(weekEnd, "yyyy-MM-dd") };
  }
  if (period === "year") {
    return {
      start: format(startOfYear(date), "yyyy-MM-dd"),
      end: format(endOfYear(date), "yyyy-MM-dd"),
    };
  }
  // month (default)
  return {
    start: format(startOfMonth(date), "yyyy-MM-dd"),
    end: format(endOfMonth(date), "yyyy-MM-dd"),
  };
}

/** Build a lookup map of categoryId -> category for quick rendering. */
export function categoryMap(categories) {
  return Object.fromEntries(categories.map((c) => [String(c._id), c]));
}

/** Non-archived, top-level-first categories for the "add expense" picker. */
export function pickableCategories(categories) {
  return categories
    .filter((c) => !c.isArchived)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

/** Children of a given parent category (one level deep). */
export function subcategoriesOf(categories, parentId) {
  return categories.filter((c) => String(c.parentId) === String(parentId));
}

/** Top-level categories only (no parentId). */
export function topLevelCategories(categories) {
  return categories.filter((c) => !c.parentId);
}
