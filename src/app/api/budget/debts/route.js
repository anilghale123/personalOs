import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongoose";
import Debt from "@/models/Debt";
import { toMinorUnits } from "@/lib/money";
import { DEBT_KINDS } from "@/features/budget/constants";

const KINDS = DEBT_KINDS.map((k) => k.id);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** GET /api/budget/debts — every debt for the current user, open ones first. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await connectDB();
  const debts = await Debt.find({ userId: session.user.id })
    .sort({ status: 1, createdAt: -1 })
    .lean();
  return NextResponse.json(debts);
}

/**
 * POST /api/budget/debts — record a new debt.
 * Body: { name, kind?, counterparty?, principal, interestRate?, dueDate?, note? }
 */
export async function POST(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json();
  const { name, kind, counterparty, principal, interestRate, dueDate, note } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "A debt name is required." }, { status: 400 });
  }
  const principalPaisa = toMinorUnits(principal);
  if (!principalPaisa || principalPaisa <= 0) {
    return NextResponse.json({ error: "A valid amount is required." }, { status: 400 });
  }
  if (kind && !KINDS.includes(kind)) {
    return NextResponse.json({ error: "Invalid debt kind." }, { status: 400 });
  }
  if (dueDate && !DATE_RE.test(dueDate)) {
    return NextResponse.json({ error: "Invalid due date." }, { status: 400 });
  }

  await connectDB();
  try {
    const debt = await Debt.create({
      userId: session.user.id,
      name: name.trim(),
      kind: kind || "owe",
      counterparty: counterparty?.trim() || undefined,
      principalPaisa,
      interestRate: Number(interestRate) || 0,
      dueDate: dueDate || undefined,
      note: note?.trim() || undefined,
    });
    return NextResponse.json(debt, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
