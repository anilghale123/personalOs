import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongoose";
import Expense from "@/models/Expense";

/** POST /api/budget/expenses/[id]/undo — restores a soft-deleted expense. */
export async function POST(request, { params }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await connectDB();
  const expense = await Expense.findOneAndUpdate(
    { _id: params.id, userId: session.user.id },
    { $set: { deletedAt: null } },
    { new: true }
  ).lean();

  if (!expense) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(expense);
}
