import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongoose";
import DailyJournal from "@/models/DailyJournal";
import QuickNote from "@/models/QuickNote";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Find or silently create the DailyJournal anchoring a given day.
 * @returns {Promise<import('mongoose').Document>}
 */
async function ensureDailyJournal(userId, date) {
  return DailyJournal.findOneAndUpdate(
    { userId, date },
    { $setOnInsert: { userId, date } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

/**
 * GET /api/journal/notes?date=YYYY-MM-DD&limit=&skip=
 * Paginated quick notes for a day (oldest first).
 */
export async function GET(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  if (!DATE_RE.test(date || "")) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }
  const limit = Math.min(Number(searchParams.get("limit")) || 200, 500);
  const skip = Number(searchParams.get("skip")) || 0;

  await connectDB();
  const notes = await QuickNote.find({ userId: session.user.id, date })
    .sort({ createdAt: 1 })
    .skip(skip)
    .limit(limit)
    .lean();
  return NextResponse.json(notes);
}

/**
 * POST /api/journal/notes
 * Instantly capture a quick note. Auto-creates the day's DailyJournal.
 * Body: { date, content, type }
 */
export async function POST(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { date, content, type } = await request.json();
  if (!DATE_RE.test(date || "")) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }
  if (!content || !content.trim()) {
    return NextResponse.json(
      { error: "Note content is required." },
      { status: 400 }
    );
  }

  await connectDB();
  try {
    const journal = await ensureDailyJournal(session.user.id, date);
    const note = await QuickNote.create({
      journalId: journal._id,
      userId: session.user.id,
      date,
      content: content.trim(),
      type: type || "note",
    });
    return NextResponse.json(note, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
