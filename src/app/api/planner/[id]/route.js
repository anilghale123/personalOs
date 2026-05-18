import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongoose";
import PlannerGoal from "@/models/PlannerGoal";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const STATUS = ["pending", "done", "missed"];

/**
 * PATCH /api/planner/[id]
 * Rename a goal, or set one day's completion status.
 * Body: { title? } and/or { day, status }
 */
export async function PATCH(request, { params }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { title, day, status } = await request.json();

  const update = {};
  if (typeof title === "string") {
    if (!title.trim()) {
      return NextResponse.json(
        { error: "Goal title cannot be empty." },
        { status: 400 }
      );
    }
    update.title = title.trim();
  }
  if (day !== undefined || status !== undefined) {
    if (!DAYS.includes(day) || !STATUS.includes(status)) {
      return NextResponse.json(
        { error: "Invalid day or status." },
        { status: 400 }
      );
    }
    update[`days.${day}`] = status;
  }
  if (!Object.keys(update).length) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  await connectDB();
  const goal = await PlannerGoal.findOneAndUpdate(
    { _id: params.id, userId: session.user.id },
    { $set: update },
    { new: true, runValidators: true }
  ).lean();

  if (!goal) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(goal);
}

/** DELETE /api/planner/[id] */
export async function DELETE(request, { params }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await connectDB();
  const res = await PlannerGoal.deleteOne({
    _id: params.id,
    userId: session.user.id,
  });
  if (!res.deletedCount) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
