import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongoose";
import Debt from "@/models/Debt";

/** DELETE /api/budget/debts/[id]/entries/[entryId] — undo one ledger line. */
export async function DELETE(request, { params }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await connectDB();
  const debt = await Debt.findOneAndUpdate(
    { _id: params.id, userId: session.user.id },
    { $pull: { entries: { _id: params.entryId } } },
    { new: true }
  ).lean();

  if (!debt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(debt);
}
