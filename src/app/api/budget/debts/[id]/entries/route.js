import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongoose";
import Debt from "@/models/Debt";
import { toMinorUnits } from "@/lib/money";
import { toDateKey } from "@/lib/utils";
import { DEBT_ENTRY_TYPES } from "@/features/budget/constants";

const TYPES = DEBT_ENTRY_TYPES.map((t) => t.id);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * POST /api/budget/debts/[id]/entries — log a repayment or extra borrowing.
 * Body: { type, amount, date?, note? }
 */
export async function POST(request, { params }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { type, amount, date, note } = await request.json();

  if (!TYPES.includes(type)) {
    return NextResponse.json({ error: "Invalid entry type." }, { status: 400 });
  }
  const amountPaisa = toMinorUnits(amount);
  if (!amountPaisa || amountPaisa <= 0) {
    return NextResponse.json({ error: "A valid amount is required." }, { status: 400 });
  }

  await connectDB();
  const debt = await Debt.findOneAndUpdate(
    { _id: params.id, userId: session.user.id },
    {
      $push: {
        entries: {
          type,
          amountPaisa,
          date: date && DATE_RE.test(date) ? date : toDateKey(),
          note: note?.trim() || undefined,
        },
      },
    },
    { new: true, runValidators: true }
  ).lean();

  if (!debt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(debt, { status: 201 });
}
