import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongoose";
import Debt from "@/models/Debt";
import { toMinorUnits } from "@/lib/money";
import { DEBT_KINDS } from "@/features/budget/constants";

const KINDS = DEBT_KINDS.map((k) => k.id);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * PATCH /api/budget/debts/[id]
 * Body: any subset of { name, kind, counterparty, principal, interestRate, dueDate, note, status }
 */
export async function PATCH(request, { params }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json();
  const update = {};

  if (body.name !== undefined) {
    if (!body.name.trim()) {
      return NextResponse.json({ error: "A debt name is required." }, { status: 400 });
    }
    update.name = body.name.trim();
  }
  if (body.principal !== undefined) {
    const principalPaisa = toMinorUnits(body.principal);
    if (!principalPaisa || principalPaisa <= 0) {
      return NextResponse.json({ error: "A valid amount is required." }, { status: 400 });
    }
    update.principalPaisa = principalPaisa;
  }
  if (body.kind !== undefined) {
    if (!KINDS.includes(body.kind)) {
      return NextResponse.json({ error: "Invalid debt kind." }, { status: 400 });
    }
    update.kind = body.kind;
  }
  if (body.dueDate !== undefined) {
    if (body.dueDate && !DATE_RE.test(body.dueDate)) {
      return NextResponse.json({ error: "Invalid due date." }, { status: 400 });
    }
    update.dueDate = body.dueDate || undefined;
  }
  if (body.counterparty !== undefined) update.counterparty = body.counterparty.trim();
  if (body.note !== undefined) update.note = body.note.trim();
  if (body.interestRate !== undefined) update.interestRate = Number(body.interestRate) || 0;
  if (body.status !== undefined) {
    if (!["active", "closed"].includes(body.status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    update.status = body.status;
  }

  if (!Object.keys(update).length) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  await connectDB();
  const debt = await Debt.findOneAndUpdate(
    { _id: params.id, userId: session.user.id },
    { $set: update },
    { new: true, runValidators: true }
  ).lean();

  if (!debt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(debt);
}

/** DELETE /api/budget/debts/[id] — removes the debt and its whole ledger. */
export async function DELETE(request, { params }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await connectDB();
  const debt = await Debt.findOneAndDelete({
    _id: params.id,
    userId: session.user.id,
  }).lean();
  if (!debt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
