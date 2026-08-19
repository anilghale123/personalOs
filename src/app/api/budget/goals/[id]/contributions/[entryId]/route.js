import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongoose";
import FinancialGoal from "@/models/FinancialGoal";

/** DELETE /api/budget/goals/[id]/contributions/[entryId] — undo one deposit. */
export async function DELETE(request, { params }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await connectDB();
  const goal = await FinancialGoal.findOneAndUpdate(
    { _id: params.id, userId: session.user.id },
    { $pull: { contributions: { _id: params.entryId } } },
    { new: true }
  ).lean();

  if (!goal) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(goal);
}
