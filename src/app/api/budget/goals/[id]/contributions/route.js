import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongoose";
import FinancialGoal from "@/models/FinancialGoal";
import { toMinorUnits } from "@/lib/money";
import { toDateKey } from "@/lib/utils";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * POST /api/budget/goals/[id]/contributions — put money towards a goal.
 * Body: { amount, date?, note? }
 */
export async function POST(request, { params }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { amount, date, note } = await request.json();

  const amountPaisa = toMinorUnits(amount);
  if (!amountPaisa || amountPaisa <= 0) {
    return NextResponse.json({ error: "A valid amount is required." }, { status: 400 });
  }

  await connectDB();
  const goal = await FinancialGoal.findOneAndUpdate(
    { _id: params.id, userId: session.user.id },
    {
      $push: {
        contributions: {
          amountPaisa,
          date: date && DATE_RE.test(date) ? date : toDateKey(),
          note: note?.trim() || undefined,
        },
      },
    },
    { new: true, runValidators: true }
  ).lean();

  if (!goal) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(goal, { status: 201 });
}
