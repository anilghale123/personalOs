"use server";

import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongoose";
import PlannerGoal from "@/models/PlannerGoal";
import { weekStartKey } from "@/lib/week";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** All planner goals for one Monday-anchored week ('YYYY-MM-DD'). */
export async function getPlannerWeek(weekStart) {
  const session = await auth();
  if (!session?.user?.id) return [];
  await connectDB();
  const goals = await PlannerGoal.find({
    userId: session.user.id,
    weekStart,
  })
    .sort({ createdAt: 1 })
    .lean();
  return JSON.parse(JSON.stringify(goals));
}

/**
 * Completion summary of the current week's planner — used by the
 * Weekly Review to report results based on done vs. missed days.
 */
export async function getPlannerSummary() {
  const session = await auth();
  if (!session?.user?.id) return { items: [], overall: 0 };
  await connectDB();
  const goals = await PlannerGoal.find({
    userId: session.user.id,
    weekStart: weekStartKey(),
  })
    .sort({ createdAt: 1 })
    .lean();

  const items = goals.map((g) => {
    const statuses = DAYS.map((d) => g.days?.[d] || "pending");
    const done = statuses.filter((s) => s === "done").length;
    const missed = statuses.filter((s) => s === "missed").length;
    return {
      _id: String(g._id),
      title: g.title,
      done,
      missed,
      completion: Math.round((done / DAYS.length) * 100),
    };
  });

  const totalDone = items.reduce((sum, i) => sum + i.done, 0);
  const overall = items.length
    ? Math.round((totalDone / (items.length * DAYS.length)) * 100)
    : 0;

  return { items, overall };
}
