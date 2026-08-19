import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongoose";
import FinancialGoal from "@/models/FinancialGoal";
import { toMinorUnits } from "@/lib/money";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** GET /api/budget/goals — savings goals for the current user. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await connectDB();
  const goals = await FinancialGoal.find({ userId: session.user.id })
    .sort({ status: 1, createdAt: -1 })
    .lean();
  return NextResponse.json(goals);
}

/**
 * POST /api/budget/goals — create a savings goal.
 * Body: { name, target, icon?, color?, targetDate?, note? }
 */
export async function POST(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { name, target, icon, color, targetDate, note } = await request.json();

  if (!name?.trim()) {
    return NextResponse.json({ error: "A goal name is required." }, { status: 400 });
  }
  const targetPaisa = toMinorUnits(target);
  if (!targetPaisa || targetPaisa <= 0) {
    return NextResponse.json({ error: "A valid target amount is required." }, { status: 400 });
  }
  if (targetDate && !DATE_RE.test(targetDate)) {
    return NextResponse.json({ error: "Invalid target date." }, { status: 400 });
  }

  await connectDB();
  try {
    const goal = await FinancialGoal.create({
      userId: session.user.id,
      name: name.trim(),
      icon: icon || "🎯",
      color: color || "#16a34a",
      targetPaisa,
      targetDate: targetDate || undefined,
      note: note?.trim() || undefined,
    });
    return NextResponse.json(goal, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
