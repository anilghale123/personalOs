import {
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  format,
} from "date-fns";
import { weekRange } from "@/lib/week";
import { BUDGET_WARNING_RATIO } from "./constants";

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

/** Maps a Budget document's `period` ("weekly"/"monthly") to a periodRange key. */
export function periodKey(period) {
  return period === "weekly" ? "week" : "month";
}

/** 'YYYY-MM-DD' start/end for a Budget period, anchored at `date`. */
export function budgetPeriodRange(period, date = new Date()) {
  return periodRange(periodKey(period), date);
}

/** Human label for the period a budget covers, e.g. "Aug 18 – Aug 24". */
export function budgetPeriodLabel(period, date = new Date()) {
  const { start, end } = budgetPeriodRange(period, date);
  const fmt = (key) => format(new Date(`${key}T12:00:00`), "MMM d");
  return `${fmt(start)} – ${fmt(end)}`;
}

/**
 * Spend status for one budget line. `ratio` is uncapped so callers can
 * show how far past the limit the user actually is.
 * @returns {{ratio: number, remainingPaisa: number, overPaisa: number, level: 'none'|'ok'|'warning'|'over'}}
 */
export function budgetStatus(spentPaisa, budgetPaisa) {
  const spent = Number(spentPaisa) || 0;
  const limit = Number(budgetPaisa) || 0;
  if (limit <= 0) {
    return { ratio: 0, remainingPaisa: 0, overPaisa: 0, level: "none" };
  }
  const ratio = spent / limit;
  return {
    ratio,
    remainingPaisa: Math.max(limit - spent, 0),
    overPaisa: Math.max(spent - limit, 0),
    level: ratio > 1 ? "over" : ratio >= BUDGET_WARNING_RATIO ? "warning" : "ok",
  };
}

/** Sum of a debt's ledger — what's been paid off and what's still outstanding. */
export function debtTotals(debt) {
  const entries = debt?.entries || [];
  const paidPaisa = entries
    .filter((e) => e.type === "payment")
    .reduce((sum, e) => sum + (Number(e.amountPaisa) || 0), 0);
  const borrowedPaisa = entries
    .filter((e) => e.type === "borrow")
    .reduce((sum, e) => sum + (Number(e.amountPaisa) || 0), 0);
  const totalPaisa = (Number(debt?.principalPaisa) || 0) + borrowedPaisa;
  const remainingPaisa = Math.max(totalPaisa - paidPaisa, 0);
  return {
    paidPaisa,
    borrowedPaisa,
    totalPaisa,
    remainingPaisa,
    progress: totalPaisa > 0 ? Math.min((paidPaisa / totalPaisa) * 100, 100) : 0,
    isCleared: totalPaisa > 0 && paidPaisa >= totalPaisa,
  };
}

/** Saved-so-far and progress for a savings goal. */
export function goalTotals(goal) {
  const savedPaisa = (goal?.contributions || []).reduce(
    (sum, c) => sum + (Number(c.amountPaisa) || 0),
    0
  );
  const targetPaisa = Number(goal?.targetPaisa) || 0;
  const remainingPaisa = Math.max(targetPaisa - savedPaisa, 0);
  return {
    savedPaisa,
    targetPaisa,
    remainingPaisa,
    progress: targetPaisa > 0 ? Math.min((savedPaisa / targetPaisa) * 100, 100) : 0,
    isAchieved: targetPaisa > 0 && savedPaisa >= targetPaisa,
  };
}

/**
 * Flat, parent-then-children ordering for a `<select>` of categories.
 * Archived categories are dropped unless they're the one currently
 * selected — an old expense must keep showing its original category.
 */
export function categoryOptions(categories, keepId) {
  const parents = topLevelCategories(categories).sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
  );
  const visible = (c) => !c.isArchived || String(c._id) === String(keepId);
  const out = [];
  for (const parent of parents) {
    const children = subcategoriesOf(categories, parent._id).filter(visible);
    if (!visible(parent) && children.length === 0) continue;
    if (visible(parent)) out.push({ ...parent, depth: 0 });
    children.forEach((child) => out.push({ ...child, depth: 1 }));
  }
  return out;
}
