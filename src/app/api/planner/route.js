import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongoose";
import PlannerGoal from "@/models/PlannerGoal";
import { getPlannerWeek } from "@/features/planner/actions";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/planner?weekStart=YYYY-MM-DD — goals for that week.
 * The first time a current/future week with no goals is opened, its
 * goal titles are copied forward from the most recent prior week
 * (see getPlannerWeek) so you don't have to re-add everything each
 * week — remove what you don't need and it stays removed.
 */
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

  const goals = await getPlannerWeek(weekStart);
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
