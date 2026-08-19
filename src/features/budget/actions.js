"use server";

import connectDB from "@/lib/mongoose";
import Category from "@/models/Category";
import Expense from "@/models/Expense";
import Debt from "@/models/Debt";
import FinancialGoal from "@/models/FinancialGoal";
import { auth } from "@/lib/auth";
import { sumMinor } from "@/lib/money";
import { DEFAULT_CATEGORIES } from "./constants";
import { periodRange } from "./utils";
import { computeBudgetSummary } from "./summary";

function plain(doc) {
  return JSON.parse(JSON.stringify(doc));
}

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
  if (!session?.user?.id) return [];
  await connectDB();
  const categories = await Category.find({ userId: session.user.id })
    .sort({ sortOrder: 1, createdAt: 1 })
    .lean();
  return plain(categories);
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
  if (!session?.user?.id) return { expenses: [], totalPaisa: 0 };
  await connectDB();

  const query = { userId: session.user.id, deletedAt: null };
  if (filters.categoryId) query.categoryId = filters.categoryId;
  if (filters.paymentMethod) query.paymentMethod = filters.paymentMethod;
  if (filters.dateFrom || filters.dateTo) {
    query.date = {};
    if (filters.dateFrom) query.date.$gte = filters.dateFrom;
    if (filters.dateTo) query.date.$lte = filters.dateTo;
  }
  if (filters.tag) query.tags = filters.tag;
  if (filters.q?.trim()) {
    query.note = { $regex: filters.q.trim(), $options: "i" };
  }

  const expenses = await Expense.find(query).sort(sortFor(filters.sort)).lean();
  const totalPaisa = sumMinor(expenses);
  return { expenses: plain(expenses), totalPaisa };
}

/** Convenience wrapper — this month's expenses (used as the Budget page's default view). */
export async function getCurrentMonthExpenses() {
  const { start, end } = periodRange("month");
  return getExpenses({ dateFrom: start, dateTo: end, sort: "date_desc" });
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
  if (!session?.user?.id) return [];
  await connectDB();
  const debts = await Debt.find({ userId: session.user.id })
    .sort({ status: 1, createdAt: -1 })
    .lean();
  return plain(debts);
}

/** All savings goals for the current user, active ones first. */
export async function getFinancialGoals() {
  const session = await auth();
  if (!session?.user?.id) return [];
  await connectDB();
  const goals = await FinancialGoal.find({ userId: session.user.id })
    .sort({ status: 1, createdAt: -1 })
    .lean();
  return plain(goals);
}
