import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongoose";
import Budget from "@/models/Budget";
import { computeBudgetSummary } from "@/features/budget/summary";

/** DELETE /api/budget/budgets/[id] — remove a budget line entirely. */
export async function DELETE(request, { params }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await connectDB();
  const budget = await Budget.findOneAndDelete({
    _id: params.id,
    userId: session.user.id,
  }).lean();
  if (!budget) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const summary = await computeBudgetSummary(session.user.id, budget.period);
  return NextResponse.json(summary);
}
