import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongoose";
import PlannerGoal from "@/models/PlannerGoal";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** GET /api/planner?weekStart=YYYY-MM-DD — goals for that week. */
export async function GET(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const weekStart = new URL(request.url).searchParams.get("weekStart");
  if (!DATE_RE.test(weekStart || "")) {
    return NextResponse.json(
      { error: "A valid weekStart date is required." },
      { status: 400 }
    );
  }

  await connectDB();
  const goals = await PlannerGoal.find({
    userId: session.user.id,
    weekStart,
  })
    .sort({ createdAt: 1 })
    .lean();
  return NextResponse.json(goals);
}

/**
 * POST /api/planner — add a goal row for a week.
 * Body: { weekStart, title }
 */
export async function POST(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { weekStart, title } = await request.json();
  if (!DATE_RE.test(weekStart || "")) {
    return NextResponse.json(
      { error: "A valid weekStart date is required." },
      { status: 400 }
    );
  }
  if (!title?.trim()) {
    return NextResponse.json(
      { error: "A goal title is required." },
      { status: 400 }
    );
  }

  await connectDB();
  try {
    const goal = await PlannerGoal.create({
      userId: session.user.id,
      weekStart,
      title: title.trim(),
    });
    return NextResponse.json(goal, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
