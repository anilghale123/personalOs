import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongoose";
import FinancialGoal from "@/models/FinancialGoal";
import { toMinorUnits } from "@/lib/money";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = ["active", "achieved", "archived"];

/**
 * PATCH /api/budget/goals/[id]
 * Body: any subset of { name, target, icon, color, targetDate, note, status }
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
      return NextResponse.json({ error: "A goal name is required." }, { status: 400 });
    }
    update.name = body.name.trim();
  }
  if (body.target !== undefined) {
    const targetPaisa = toMinorUnits(body.target);
    if (!targetPaisa || targetPaisa <= 0) {
      return NextResponse.json({ error: "A valid target amount is required." }, { status: 400 });
    }
    update.targetPaisa = targetPaisa;
  }
  if (body.targetDate !== undefined) {
    if (body.targetDate && !DATE_RE.test(body.targetDate)) {
      return NextResponse.json({ error: "Invalid target date." }, { status: 400 });
    }
    update.targetDate = body.targetDate || undefined;
  }
  if (body.icon !== undefined) update.icon = body.icon;
  if (body.color !== undefined) update.color = body.color;
  if (body.note !== undefined) update.note = body.note.trim();
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    update.status = body.status;
  }

  if (!Object.keys(update).length) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  await connectDB();
  const goal = await FinancialGoal.findOneAndUpdate(
    { _id: params.id, userId: session.user.id },
    { $set: update },
    { new: true, runValidators: true }
  ).lean();

  if (!goal) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(goal);
}

/** DELETE /api/budget/goals/[id] — removes the goal and its contributions. */
export async function DELETE(request, { params }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await connectDB();
  const goal = await FinancialGoal.findOneAndDelete({
    _id: params.id,
    userId: session.user.id,
  }).lean();
  if (!goal) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
