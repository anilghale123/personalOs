import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongoose";
import Expense from "@/models/Expense";
import Category from "@/models/Category";
import { sumMinor, toMinorUnits } from "@/lib/money";
import { toDateKey } from "@/lib/utils";
import { PAYMENT_METHODS, RECURRENCE_FREQUENCIES } from "@/features/budget/constants";

const PAYMENT_IDS = PAYMENT_METHODS.map((p) => p.id);
const FREQ_IDS = RECURRENCE_FREQUENCIES.map((f) => f.id);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

/**
 * GET /api/budget/expenses — filtered list + running total for the filter set.
 * Query: categoryId, paymentMethod, dateFrom, dateTo, tag, q, sort
 */
export async function GET(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const query = { userId: session.user.id, deletedAt: null };

  const categoryId = searchParams.get("categoryId");
  if (categoryId) query.categoryId = categoryId;

  const paymentMethod = searchParams.get("paymentMethod");
  if (paymentMethod) query.paymentMethod = paymentMethod;

  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  if (dateFrom || dateTo) {
    query.date = {};
    if (dateFrom) query.date.$gte = dateFrom;
    if (dateTo) query.date.$lte = dateTo;
  }

  const tag = searchParams.get("tag");
  if (tag) query.tags = tag;

  const q = searchParams.get("q");
  if (q?.trim()) query.note = { $regex: q.trim(), $options: "i" };

  await connectDB();
  const expenses = await Expense.find(query)
    .sort(sortFor(searchParams.get("sort")))
    .lean();
  const totalPaisa = sumMinor(expenses);
  return NextResponse.json({ expenses, totalPaisa });
}

/**
 * POST /api/budget/expenses — create an expense. The primary "fast" flow
 * only needs amount + categoryId; everything else is optional.
 * Body: { amount, categoryId, date?, note?, paymentMethod?, tags?,
 *         isRecurring?, recurrence? }
 */
export async function POST(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json();
  const {
    amount,
    categoryId,
    date,
    note,
    paymentMethod,
    tags,
    isRecurring,
    recurrence,
  } = body;

  const amountPaisa = toMinorUnits(amount);
  if (!amountPaisa || amountPaisa <= 0) {
    return NextResponse.json({ error: "A valid amount is required." }, { status: 400 });
  }
  if (!categoryId) {
    return NextResponse.json({ error: "A category is required." }, { status: 400 });
  }
  const expenseDate = date && DATE_RE.test(date) ? date : toDateKey();

  if (paymentMethod && !PAYMENT_IDS.includes(paymentMethod)) {
    return NextResponse.json({ error: "Invalid payment method." }, { status: 400 });
  }
  if (isRecurring && (!recurrence || !FREQ_IDS.includes(recurrence.frequency))) {
    return NextResponse.json(
      { error: "A valid recurrence frequency is required for recurring expenses." },
      { status: 400 }
    );
  }

  await connectDB();
  const category = await Category.findOne({ _id: categoryId, userId: session.user.id }).lean();
  if (!category) {
    return NextResponse.json({ error: "Category not found." }, { status: 400 });
  }

  try {
    const expense = await Expense.create({
      userId: session.user.id,
      amountPaisa,
      currency: "NPR",
      categoryId,
      date: expenseDate,
      note: note?.trim() || undefined,
      paymentMethod: paymentMethod || "cash",
      tags: Array.isArray(tags) ? tags.filter(Boolean).map((t) => t.trim()) : [],
      isRecurring: Boolean(isRecurring),
      recurrence: isRecurring ? recurrence : undefined,
    });
    return NextResponse.json(expense, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
