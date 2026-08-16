"use server";

import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongoose";
import PlannerGoal from "@/models/PlannerGoal";
import PlannerWeekState from "@/models/PlannerWeekState";
import { weekStartKey } from "@/lib/week";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Ensures a week has been "initialised": the first time the current
 * or a future week is opened with zero goals, its titles are copied
 * forward from the most recent prior week that had any — fresh
 * (pending) day statuses, no other fields. This runs at most once per
 * week per user: once the state doc exists, deleting every goal in
 * that week sticks and nothing gets re-added on the next load.
 */
async function initWeekIfNeeded(userId, weekStart) {
  if (weekStart < weekStartKey()) return; // never rewrite past weeks

  const state = await PlannerWeekState.findOne({ userId, weekStart }).lean();
  if (state) return;

  const currentGoals = await PlannerGoal.countDocuments({ userId, weekStart });
  if (currentGoals === 0) {
    const priorWeek = await PlannerGoal.findOne({ userId, weekStart: { $lt: weekStart } })
      .sort({ weekStart: -1 })
      .lean();
    if (priorWeek) {
      const priorGoals = await PlannerGoal.find({
        userId,
        weekStart: priorWeek.weekStart,
      }).lean();
      if (priorGoals.length) {
        await PlannerGoal.insertMany(
          priorGoals.map((g) => ({
            userId,
            weekStart,
            title: g.title,
          }))
        );
      }
    }
  }

  // Upsert guards against a duplicate init if two requests race.
  await PlannerWeekState.findOneAndUpdate(
    { userId, weekStart },
    { $setOnInsert: { carriedForward: true } },
    { upsert: true }
  );
}

/**
 * All planner goals for one Monday-anchored week ('YYYY-MM-DD'), copying
 * last week's goal titles forward the first time a current/future week
 * with no goals is opened.
 */
export async function getPlannerWeek(weekStart) {
  const session = await auth();
  if (!session?.user?.id) return [];
  await connectDB();
  await initWeekIfNeeded(session.user.id, weekStart);
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
