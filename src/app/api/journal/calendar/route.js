import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongoose";
import DailyJournal from "@/models/DailyJournal";
import QuickNote from "@/models/QuickNote";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/journal/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Returns a per-day map of mood + content/note presence, used to tint
 * the calendar and list recent entries.
 */
export async function GET(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (!DATE_RE.test(from || "") || !DATE_RE.test(to || "")) {
    return NextResponse.json(
      { error: "Valid ?from and ?to dates are required." },
      { status: 400 }
    );
  }

  await connectDB();
  const userId = new mongoose.Types.ObjectId(session.user.id);

  const [journals, noteCounts] = await Promise.all([
    DailyJournal.find({ userId, date: { $gte: from, $lte: to } })
      .select("date mood content title")
      .lean(),
    QuickNote.aggregate([
      { $match: { userId, date: { $gte: from, $lte: to } } },
      { $group: { _id: "$date", count: { $sum: 1 } } },
    ]),
  ]);

  const noteMap = Object.fromEntries(
    noteCounts.map((n) => [n._id, n.count])
  );
  const calendar = {};
  for (const j of journals) {
    calendar[j.date] = {
      mood: j.mood || null,
      title: j.title || "",
      hasContent: Boolean(j.content && j.content.trim()),
      noteCount: noteMap[j.date] || 0,
    };
  }
  // Days that only have notes (no anchor content yet).
  for (const [date, count] of Object.entries(noteMap)) {
    if (!calendar[date]) {
      calendar[date] = {
        mood: null,
        title: "",
        hasContent: false,
        noteCount: count,
      };
    }
  }

  return NextResponse.json({ calendar });
}
