import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongoose";
import PlannerGoal from "@/models/PlannerGoal";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
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
export async function GET(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const limit = Math.min(
    Math.max(Number(searchParams.get("limit")) || 12, 1),
    MAX_LIMIT
  );

  await connectDB();
  const match = { userId: new mongoose.Types.ObjectId(session.user.id) };
  if (DATE_RE.test(from || "") || DATE_RE.test(to || "")) {
    match.weekStart = {};
    if (DATE_RE.test(from || "")) match.weekStart.$gte = from;
    if (DATE_RE.test(to || "")) match.weekStart.$lte = to;
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

  return NextResponse.json(
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
