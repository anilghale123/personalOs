import mongoose from "mongoose";
import { withRoute, json } from "@/lib/api";
import { z, dateKey } from "@/lib/validation";
import PlannerGoal from "@/models/PlannerGoal";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_LIMIT = 260;

// Every day cell of a goal as one array, so a week can be tallied in Mongo.
const DAY_CELLS = DAYS.map((d) => ({ $ifNull: [`$days.${d}`, "pending"] }));
const countOf = (status) => ({
  $size: { $filter: { input: DAY_CELLS, cond: { $eq: ["$$this", status] } } },
});

/**
 * GET /api/planner/history?from=&to=&limit=
 * Per-week completion summaries, newest first. `from`/`to` bound the
 * weekStart range (the calendar asks for the month it is showing); the
 * history list just asks for the most recent `limit` weeks.
 */
const HistoryQuery = z.object({
  from: dateKey.optional(),
  to: dateKey.optional(),
  limit: z.coerce.number().int().positive().max(MAX_LIMIT).catch(12),
});

export const GET = withRoute(
  { limit: "read", query: HistoryQuery },
  async ({ userId, query }) => {
  const { from, to, limit } = query;

  // ObjectId by hand — `aggregate()` does no schema casting, so a string
  // would match nothing and every user would see an empty history.
  const match = { userId: new mongoose.Types.ObjectId(userId) };
  if (from || to) {
    match.weekStart = {};
    if (from) match.weekStart.$gte = from;
    if (to) match.weekStart.$lte = to;
  }

  const weeks = await PlannerGoal.aggregate([
    { $match: match },
    {
      $project: {
        weekStart: 1,
        title: 1,
        done: countOf("done"),
        missed: countOf("missed"),
      },
    },
    {
      $group: {
        _id: "$weekStart",
        goalCount: { $sum: 1 },
        done: { $sum: "$done" },
        missed: { $sum: "$missed" },
        titles: { $push: "$title" },
      },
    },
    { $sort: { _id: -1 } }, // 'YYYY-MM-DD' sorts chronologically
    { $limit: limit },
  ]);

  return json(
    weeks.map((w) => {
      const cells = w.goalCount * DAYS.length;
      return {
        weekStart: w._id,
        goalCount: w.goalCount,
        done: w.done,
        missed: w.missed,
        pending: cells - w.done - w.missed,
        completion: cells ? Math.round((w.done / cells) * 100) : 0,
        titles: w.titles.slice(0, 4),
      };
    })
  );
  }
);
