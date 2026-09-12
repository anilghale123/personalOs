"use server";

import connectDB from "@/lib/mongoose";
import Category from "@/models/Category";
import Expense from "@/models/Expense";
import Debt from "@/models/Debt";
import FinancialGoal from "@/models/FinancialGoal";
import User from "@/models/User";
import { auth } from "@/lib/auth";
import { buildExpenseFilter } from "./expense-filter";
import { cachedMoney, cachedReference, tags } from "@/lib/cache";
import {
  DEFAULT_CATEGORIES,
  EXPENSE_MAX_PAGE_SIZE,
  EXPENSE_PAGE_SIZE,
} from "./constants";
import { periodRange } from "./utils";
import { computeBudgetSummary, userCalendar } from "./summary";
import { plain } from "@/lib/serialize";

// Shared with the client store and the API route — see ./constants.
const PAGE_SIZE = EXPENSE_PAGE_SIZE;
const MAX_PAGE_SIZE = EXPENSE_MAX_PAGE_SIZE;

function sortFor(sort) {
  switch (sort) {
    case "date_asc":
      return { date: 1, createdAt: 1 };
    case "amount_desc":
      return { amountPaisa: -1 };
    case "amount_asc":
      return { amountPaisa: 1 };
    default:
      return { date: -1, createdAt: -1 };
  }
}

/** Seeds the default category set for a brand-new user. Safe to call repeatedly. */
export async function ensureDefaultCategories() {
  const session = await auth();
  if (!session?.user?.id) return;
  await connectDB();
  const existing = await Category.countDocuments({ userId: session.user.id });
  if (existing > 0) return;
  await Category.insertMany(
    DEFAULT_CATEGORIES.map((c, i) => ({
      ...c,
      userId: session.user.id,
      isDefault: true,
      sortOrder: i,
    }))
  );
}

/** All categories for the current user (archived included by default — callers filter). */
export async function getCategories() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return [];
  await connectDB();

  /**
   * Cached, because the Money layout refetches this on every navigation into
   * or within the section, and a category list changes about once a month.
   * Invalidated by tag on any category or expense write, so the cache is only
   * ever serving data nobody has touched.
   */
  return cachedReference(
    async () => {
      const categories = await Category.find({ userId })
        .sort({ sortOrder: 1, createdAt: 1 })
        .lean();
      return plain(categories);
    },
    { userId, key: "categories-full", tags: [tags.categories(userId)] }
  );
}

/**
 * Expenses matching the given filters, plus their paisa total.
 * @param {object} filters
 * @param {string} [filters.categoryId]
 * @param {string} [filters.paymentMethod]
 * @param {string} [filters.dateFrom] 'YYYY-MM-DD'
 * @param {string} [filters.dateTo] 'YYYY-MM-DD'
 * @param {string} [filters.tag]
 * @param {string} [filters.q] free-text search on note
 * @param {string} [filters.sort]
 */
export async function getExpenses(filters = {}) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { expenses: [], totalPaisa: 0, count: 0, hasMore: false };
  await connectDB();

  /**
   * Shares `buildExpenseFilter` with the API route rather than rebuilding the
   * query.
   *
   * The duplicate this replaced carried two bugs of its own: it interpolated
   * `filters.q` straight into a `$regex` (so a search containing `(` threw,
   * and `(a+)+$` pinned a CPU), and it fetched every matching row to sum them
   * in JavaScript. Two copies of query logic meant fixing the route fixed only
   * half the app.
   */
  const limit = Math.min(Math.max(Number(filters.limit) || PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const filter = buildExpenseFilter(userId, filters);

  const [expenses, aggregate] = await Promise.all([
    Expense.find(filter).sort(sortFor(filters.sort)).limit(limit).lean(),
    // Totals describe the whole filtered set while only a page is fetched.
    Expense.aggregate([
      { $match: buildExpenseFilter(userId, filters, { forAggregation: true }) },
      {
        $group: {
          _id: null,
          totalPaisa: { $sum: "$amountPaisa" },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const totalPaisa = aggregate[0]?.totalPaisa ?? 0;
  const count = aggregate[0]?.count ?? 0;

  return {
    expenses: plain(expenses),
    totalPaisa,
    count,
    hasMore: expenses.length < count,
  };
}

/**
 * Convenience wrapper — this month's expenses (the Budget page's default
 * view). "This month" follows the user's calendar preference so the
 * server-rendered first paint matches the month the list opens on.
 */
export async function getCurrentMonthExpenses() {
  const session = await auth();
  if (!session?.user?.id) return { expenses: [], totalPaisa: 0 };
  await connectDB();
  const cal = await userCalendar(session.user.id);
  const { start, end } = periodRange("month", new Date(), cal);
  return getExpenses({ dateFrom: start, dateTo: end, sort: "date_desc" });
}

/** The oldest expense date on record — drives the monthly record pager. */
export async function getEarliestExpenseDate() {
  const session = await auth();
  if (!session?.user?.id) return null;
  await connectDB();
  const earliest = await Expense.findOne({ userId: session.user.id, deletedAt: null })
    .sort({ date: 1 })
    .select("date")
    .lean();
  return earliest?.date ?? null;
}

/** The user's calendar preference for the money screens ('english' | 'nepali'). */
export async function getDateFormat() {
  const session = await auth();
  if (!session?.user?.id) return "english";
  await connectDB();
  const user = await User.findById(session.user.id).select("preferences").lean();
  return user?.preferences?.dateFormat === "nepali" ? "nepali" : "english";
}

/** Budget limits vs actual spend for the given period (defaults to monthly). */
export async function getBudgetSummary(period = "monthly") {
  const session = await auth();
  if (!session?.user?.id) return null;
  await connectDB();
  return plain(await computeBudgetSummary(session.user.id, period));
}

/** All debts for the current user, open ones first. */
export async function getDebts() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return [];
  await connectDB();

  // Tier 1: derived money, so tag invalidation only — never a bare TTL.
  return cachedMoney(
    async () => {
      const debts = await Debt.find({ userId })
        .sort({ status: 1, createdAt: -1 })
        .lean();
      return plain(debts);
    },
    { userId, key: "debts", tags: [tags.debts(userId), tags.money(userId)] }
  );
}

/** All savings goals for the current user, active ones first. */
export async function getFinancialGoals() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return [];
  await connectDB();

  return cachedMoney(
    async () => {
      const goals = await FinancialGoal.find({ userId })
        .sort({ status: 1, createdAt: -1 })
        .lean();
      return plain(goals);
    },
    { userId, key: "financial-goals", tags: [tags.goals(userId), tags.money(userId)] }
  );
}
