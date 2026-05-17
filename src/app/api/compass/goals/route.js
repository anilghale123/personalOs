import { NextResponse } from "next/server";
import connectDB from "@/lib/mongoose";
import Goal from "@/models/Goal";
import { auth } from "@/lib/auth";

/** GET — all non-archived goals for the current user. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await connectDB();
  const goals = await Goal.find({
    userId: session.user.id,
    isArchived: false,
  })
    .sort({ createdAt: -1 })
    .lean();
  return NextResponse.json(goals);
}

/**
 * POST — create a goal, or update milestones/sub-scores of an existing one.
 * Body (create): { title, category, targetDate, milestones, subScores }
 * Body (update): { _id, ...fields }
 */
export async function POST(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await connectDB();
  const body = await request.json();

  try {
    if (body._id) {
      const goal = await Goal.findOne({
        _id: body._id,
        userId: session.user.id,
      });
      if (!goal) {
        return NextResponse.json(
          { error: "Goal not found" },
          { status: 404 }
        );
      }
      const editable = [
        "title",
        "category",
        "targetDate",
        "milestones",
        "subScores",
        "isArchived",
      ];
      for (const key of editable) {
        if (body[key] !== undefined) goal[key] = body[key];
      }
      await goal.save(); // triggers progress recompute
      return NextResponse.json(goal);
    }

    const goal = await Goal.create({
      userId: session.user.id,
      title: body.title,
      category: body.category,
      targetDate: body.targetDate || undefined,
      milestones: body.milestones || [],
      subScores: body.subScores || [],
    });
    return NextResponse.json(goal, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
