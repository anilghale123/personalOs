import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongoose";
import WeeklyGoal from "@/models/WeeklyGoal";

/**
 * PATCH — record the end-of-week evaluation for a weekly goal.
 * Body: { rating, reflection, completionRate }
 */
export async function PATCH(request, { params }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { rating, reflection, completionRate } = await request.json();
  await connectDB();

  const goal = await WeeklyGoal.findOneAndUpdate(
    { _id: params.id, userId: session.user.id },
    {
      evaluation: {
        rating,
        reflection,
        completionRate,
        evaluatedAt: new Date(),
      },
    },
    { new: true }
  );

  if (!goal) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
