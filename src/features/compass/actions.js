"use server";

import connectDB from "@/lib/mongoose";
import HabitLog from "@/models/HabitLog";
import Goal from "@/models/Goal";
import WeeklyGoal from "@/models/WeeklyGoal";
import { getSession } from "@/lib/session";
import { weekRange } from "@/lib/week";
import { cachedReference, tags } from "@/lib/cache";
import { dateKeyFromUtcMidnight } from "@/features/patterns/dates";
import { plain } from "@/lib/serialize";

/**
 * Heatmap data for a single habit over the past 365 days.
 * @param {string} habitName
 * @returns {Promise<Record<string, {completed: boolean, value: number}>>}
 */
export async function getHeatmapData(habitName) {
  const session = await getSession();
  if (!session?.user?.id) return {};
  await connectDB();

  const since = new Date();
  since.setFullYear(since.getFullYear() - 1);

  const logs = await HabitLog.find({
    userId: session.user.id,
    habitName,
    date: { $gte: since },
  })
    .select("date completed value")
    .lean();

  return logs.reduce((acc, log) => {
    const key = dateKeyFromUtcMidnight(log.date);
    acc[key] = { completed: log.completed, value: log.value };
    return acc;
  }, {});
}

/**
 * All habit logs for the current user over the past year, shaped for
 * the multi-habit heatmap: { 'YYYY-MM-DD': { [habitName]: boolean } }.
 */
export async function getAllHeatmapData() {
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) return { heatmap: {}, habits: [] };

  /**
   * A full year of habit logs, cached.
   *
   * This is the largest single read in the app and it runs on both the
   * overview and the habits page. Uncached it re-fetched and re-shaped 365
   * days of documents on every visit, which was one of the two biggest
   * contributors to the overview feeling slow.
   *
   * Invalidated by `invalidateHabits` whenever a habit is logged, so ticking
   * one off still shows immediately; the short TTL is only a backstop.
   */
  return cachedReference(
    async () => {
      await connectDB();

      const since = new Date();
      since.setFullYear(since.getFullYear() - 1);

      const logs = await HabitLog.find({
        userId,
        date: { $gte: since },
      })
        .select("date completed habitName")
        .lean();

      const heatmap = {};
      const habits = new Set();
      for (const log of logs) {
        const key = dateKeyFromUtcMidnight(log.date);
        heatmap[key] = heatmap[key] || {};
        heatmap[key][log.habitName] = log.completed;
        habits.add(log.habitName);
      }
      return { heatmap, habits: [...habits] };
    },
    {
      userId,
      key: "all-heatmap",
      tags: [tags.habits(userId)],
      seconds: 60,
    }
  );
}

/** Fetch all non-archived goals for the current user. */
export async function getGoals() {
  const session = await getSession();
  if (!session?.user?.id) return [];
  await connectDB();
  const goals = await Goal.find({
    userId: session.user.id,
    isArchived: false,
  })
    .sort({ createdAt: -1 })
    .lean();
  return plain(goals);
}

/** Weekly goals overlapping the current (Monday-anchored) week. */
export async function getWeeklyGoals() {
  const session = await getSession();
  if (!session?.user?.id) return [];
  await connectDB();
  const { weekStart, weekEnd } = weekRange();
  const goals = await WeeklyGoal.find({
    userId: session.user.id,
    weekStart: { $lte: weekEnd },
    weekEnd: { $gte: weekStart },
  })
    .sort({ createdAt: -1 })
    .lean();
  return plain(goals);
}

/** Fetch a single goal by id (scoped to the current user). */
export async function getGoalById(goalId) {
  const session = await getSession();
  if (!session?.user?.id) return null;
  await connectDB();
  const goal = await Goal.findOne({
    _id: goalId,
    userId: session.user.id,
  }).lean();
  return goal ? plain(goal) : null;
}
