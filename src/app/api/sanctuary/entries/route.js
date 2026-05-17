import { NextResponse } from "next/server";
import connectDB from "@/lib/mongoose";
import JournalEntry from "@/models/JournalEntry";
import { auth } from "@/lib/auth";

/**
 * GET — journal entries. ?date=YYYY-MM-DD returns a single entry,
 * otherwise returns all entries (most recent first).
 */
export async function GET(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await connectDB();

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");

  if (date) {
    const entry = await JournalEntry.findOne({
      userId: session.user.id,
      date,
    }).lean();
    return NextResponse.json(entry || null);
  }

  const entries = await JournalEntry.find({ userId: session.user.id })
    .sort({ date: -1 })
    .lean();
  return NextResponse.json(entries);
}

/**
 * POST — upsert the journal entry for a day.
 * Body: { date, content, mood, tags }
 */
export async function POST(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await connectDB();
  const { date, content, mood, tags } = await request.json();

  if (!date) {
    return NextResponse.json(
      { error: "date is required" },
      { status: 400 }
    );
  }

  const wordCount = content
    ? content.trim().split(/\s+/).filter(Boolean).length
    : 0;

  try {
    const entry = await JournalEntry.findOneAndUpdate(
      { userId: session.user.id, date },
      {
        content: content || "",
        ...(mood ? { mood } : {}),
        tags: Array.isArray(tags) ? tags : [],
        wordCount,
        isSynced: true,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return NextResponse.json(entry);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
