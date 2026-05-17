import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongoose";
import WeeklyGoal from "@/models/WeeklyGoal";
import { weekRange } from "@/lib/week";

/** GET — weekly goals overlapping the current week. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await connectDB();
  const { weekStart, weekEnd } = weekRange();
  const goals = await WeeklyGoal.find({
    userId: session.user.id,
    weekStart: { $lte: weekEnd },
    weekEnd: { $gte: weekStart },
  })
    .sort({ createdAt: -1 })
    .lean();
  return NextResponse.json(goals);
}

/**
 * POST — create a weekly goal for the current week.
 * Body: { title, category, items: string[], color }
 */
export async function POST(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { title, category, items, color } = await request.json();
  if (!title?.trim() || !items?.length) {
    return NextResponse.json(
      { error: "Title and at least one checklist item are required." },
      { status: 400 }
    );
  }

  await connectDB();
  const { weekStart, weekEnd } = weekRange();
  try {
    const goal = await WeeklyGoal.create({
      userId: session.user.id,
      title: title.trim(),
      category: category || "personal",
      color: color || "blue",
      weekStart,
      weekEnd,
      checklistItems: items
        .filter((t) => t.trim())
        .map((text) => ({ text: text.trim(), isComplete: false })),
    });
    return NextResponse.json(goal, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
