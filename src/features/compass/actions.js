"use server";

import connectDB from "@/lib/mongoose";
import HabitLog from "@/models/HabitLog";
import Goal from "@/models/Goal";
import { auth } from "@/lib/auth";

/** Serialise a Mongoose doc to a plain client-safe object. */
function plain(doc) {
  return JSON.parse(JSON.stringify(doc));
}

/**
 * Heatmap data for a single habit over the past 365 days.
 * @param {string} habitName
 * @returns {Promise<Record<string, {completed: boolean, value: number}>>}
 */
export async function getHeatmapData(habitName) {
  const session = await auth();
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
    const key = log.date.toISOString().split("T")[0];
    acc[key] = { completed: log.completed, value: log.value };
    return acc;
  }, {});
}

/**
 * All habit logs for the current user over the past year, shaped for
 * the multi-habit heatmap: { 'YYYY-MM-DD': { [habitName]: boolean } }.
 */
export async function getAllHeatmapData() {
  const session = await auth();
  if (!session?.user?.id) return { heatmap: {}, habits: [] };
  await connectDB();

  const since = new Date();
  since.setFullYear(since.getFullYear() - 1);

  const logs = await HabitLog.find({
    userId: session.user.id,
    date: { $gte: since },
  })
    .select("date completed habitName")
    .lean();

  const heatmap = {};
  const habits = new Set();
  for (const log of logs) {
    const key = log.date.toISOString().split("T")[0];
    heatmap[key] = heatmap[key] || {};
    heatmap[key][log.habitName] = log.completed;
    habits.add(log.habitName);
  }
  return { heatmap, habits: [...habits] };
}

/** Fetch all non-archived goals for the current user. */
export async function getGoals() {
  const session = await auth();
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

/** Fetch a single goal by id (scoped to the current user). */
export async function getGoalById(goalId) {
  const session = await auth();
  if (!session?.user?.id) return null;
  await connectDB();
  const goal = await Goal.findOne({
    _id: goalId,
    userId: session.user.id,
  }).lean();
  return goal ? plain(goal) : null;
}
