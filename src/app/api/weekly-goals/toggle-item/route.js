import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongoose";
import WeeklyGoal from "@/models/WeeklyGoal";

/**
 * PATCH — toggle a checklist item's completion.
 * Body: { goalId, itemId, completed, date: 'YYYY-MM-DD' }
 */
export async function PATCH(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { goalId, itemId, completed, date } = await request.json();
  await connectDB();

  const update = completed
    ? {
        $set: { "checklistItems.$.isComplete": true },
        $addToSet: { "checklistItems.$.completedDates": date },
      }
    : {
        $set: { "checklistItems.$.isComplete": false },
        $pull: { "checklistItems.$.completedDates": date },
      };

  const goal = await WeeklyGoal.findOneAndUpdate(
    {
      _id: goalId,
      userId: session.user.id,
      "checklistItems._id": itemId,
    },
    update,
    { new: true }
  );

  if (!goal) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
