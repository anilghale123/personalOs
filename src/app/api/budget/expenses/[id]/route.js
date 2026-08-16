import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongoose";
import Expense from "@/models/Expense";
import Category from "@/models/Category";
import { toMinorUnits } from "@/lib/money";
import { PAYMENT_METHODS } from "@/features/budget/constants";

const PAYMENT_IDS = PAYMENT_METHODS.map((p) => p.id);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * PATCH /api/budget/expenses/[id]
 * Body: any subset of { amount, categoryId, date, note, paymentMethod, tags, isRecurring, recurrence }
 */
export async function PATCH(request, { params }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json();
  const update = {};

  if (body.amount !== undefined) {
    const amountPaisa = toMinorUnits(body.amount);
    if (!amountPaisa || amountPaisa <= 0) {
      return NextResponse.json({ error: "A valid amount is required." }, { status: 400 });
    }
    update.amountPaisa = amountPaisa;
  }
  if (body.categoryId) {
    await connectDB();
    const category = await Category.findOne({ _id: body.categoryId, userId: session.user.id }).lean();
    if (!category) {
      return NextResponse.json({ error: "Category not found." }, { status: 400 });
    }
    update.categoryId = body.categoryId;
  }
  if (body.date) {
    if (!DATE_RE.test(body.date)) {
      return NextResponse.json({ error: "Invalid date." }, { status: 400 });
    }
    update.date = body.date;
  }
  if (typeof body.note === "string") update.note = body.note.trim();
  if (body.paymentMethod) {
    if (!PAYMENT_IDS.includes(body.paymentMethod)) {
      return NextResponse.json({ error: "Invalid payment method." }, { status: 400 });
    }
    update.paymentMethod = body.paymentMethod;
  }
  if (Array.isArray(body.tags)) {
    update.tags = body.tags.filter(Boolean).map((t) => String(t).trim());
  }
  if (typeof body.isRecurring === "boolean") {
    update.isRecurring = body.isRecurring;
    if (!body.isRecurring) update.recurrence = undefined;
  }
  if (body.recurrence) update.recurrence = body.recurrence;

  if (!Object.keys(update).length) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  await connectDB();
  const expense = await Expense.findOneAndUpdate(
    { _id: params.id, userId: session.user.id, deletedAt: null },
    { $set: update },
    { new: true, runValidators: true }
  ).lean();

  if (!expense) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(expense);
}

/** DELETE /api/budget/expenses/[id] — soft delete, restorable via the undo toast. */
export async function DELETE(request, { params }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await connectDB();
  const expense = await Expense.findOneAndUpdate(
    { _id: params.id, userId: session.user.id, deletedAt: null },
    { $set: { deletedAt: new Date() } },
    { new: true }
  ).lean();

  if (!expense) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(expense);
}
