import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongoose";
import Budget from "@/models/Budget";
import Category from "@/models/Category";
import { toMinorUnits } from "@/lib/money";
import { computeBudgetSummary } from "@/features/budget/summary";
import { budgetPeriodRange } from "@/features/budget/utils";
import { BUDGET_PERIODS } from "@/features/budget/constants";

const PERIODS = BUDGET_PERIODS.map((p) => p.id);

/**
 * GET /api/budget/budgets?period=monthly
 * Budget limits for the current period alongside what's actually been spent.
 */
export async function GET(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const period = new URL(request.url).searchParams.get("period") || "monthly";
  if (!PERIODS.includes(period)) {
    return NextResponse.json({ error: "Invalid period." }, { status: 400 });
  }
  await connectDB();
  const summary = await computeBudgetSummary(session.user.id, period);
  return NextResponse.json(summary);
}

/**
 * PUT /api/budget/budgets — set (or clear) one budget line for the current period.
 * Body: { period, scope, categoryId?, amount, carryForward? }
 * An amount of 0 removes the line.
 */
export async function PUT(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { period, scope, categoryId, amount, carryForward } = await request.json();

  if (!PERIODS.includes(period)) {
    return NextResponse.json({ error: "Invalid period." }, { status: 400 });
  }
  if (scope !== "total" && scope !== "category") {
    return NextResponse.json({ error: "Invalid budget scope." }, { status: 400 });
  }
  if (scope === "category" && !categoryId) {
    return NextResponse.json(
      { error: "A category is required for a category budget." },
      { status: 400 }
    );
  }

  const amountPaisa = toMinorUnits(amount);
  if (amountPaisa < 0) {
    return NextResponse.json({ error: "A valid amount is required." }, { status: 400 });
  }

  await connectDB();

  if (scope === "category") {
    const category = await Category.findOne({
      _id: categoryId,
      userId: session.user.id,
    }).lean();
    if (!category) {
      return NextResponse.json({ error: "Category not found." }, { status: 400 });
    }
  }

  const { start } = budgetPeriodRange(period);
  const filter = {
    userId: session.user.id,
    period,
    periodStart: start,
    scope,
    categoryId: scope === "category" ? categoryId : null,
  };

  if (amountPaisa === 0) {
    // Clearing must also stop any earlier budget from carrying into this
    // period, otherwise the old limit would silently reappear.
    await Budget.deleteOne(filter);
    await Budget.updateMany(
      { ...filter, periodStart: { $lt: start } },
      { $set: { carryForward: false } }
    );
  } else {
    await Budget.findOneAndUpdate(
      filter,
      { $set: { amountPaisa, carryForward: carryForward !== false } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  const summary = await computeBudgetSummary(session.user.id, period);
  return NextResponse.json(summary);
}
