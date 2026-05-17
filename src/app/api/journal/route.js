import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongoose";
import DailyJournal from "@/models/DailyJournal";
import QuickNote from "@/models/QuickNote";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/journal?date=YYYY-MM-DD
 * Returns the daily anchor journal and all quick notes for a day.
 */
export async function GET(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  if (!DATE_RE.test(date || "")) {
    return NextResponse.json(
      { error: "A valid ?date=YYYY-MM-DD is required." },
      { status: 400 }
    );
  }

  await connectDB();
  const [journal, notes] = await Promise.all([
    DailyJournal.findOne({ userId: session.user.id, date }).lean(),
    QuickNote.find({ userId: session.user.id, date })
      .sort({ createdAt: 1 })
      .lean(),
  ]);

  return NextResponse.json({ journal: journal || null, notes });
}

/**
 * PUT /api/journal
 * Autosave upsert for the daily anchor journal.
 * Body: { date, mood, title, content, tags }
 */
export async function PUT(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json();
  const { date, mood, title, content, tags } = body;
  if (!DATE_RE.test(date || "")) {
    return NextResponse.json(
      { error: "A valid date is required." },
      { status: 400 }
    );
  }

  await connectDB();
  try {
    const journal = await DailyJournal.findOneAndUpdate(
      { userId: session.user.id, date },
      {
        $set: {
          mood: mood || null,
          title: title || "",
          content: content || "",
          tags: Array.isArray(tags) ? tags : [],
        },
        $setOnInsert: { userId: session.user.id, date },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    return NextResponse.json(journal);
  } catch (err) {
    if (err.code === 11000) {
      // Race on first-write: the doc now exists, retry as a plain update.
      const journal = await DailyJournal.findOneAndUpdate(
        { userId: session.user.id, date },
        {
          $set: {
            mood: mood || null,
            title: title || "",
            content: content || "",
            tags: Array.isArray(tags) ? tags : [],
          },
        },
        { new: true }
      ).lean();
      return NextResponse.json(journal);
    }
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
