import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongoose";
import DailyJournal from "@/models/DailyJournal";
import QuickNote from "@/models/QuickNote";

/** Escape user input for safe use inside a RegExp. */
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * GET /api/journal/search?q=term
 * Searches daily journals (title, content, tags) and quick notes
 * (content). Results are grouped by day, most recent first.
 */
export async function GET(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  await connectDB();
  const rx = new RegExp(escapeRegex(q), "i");
  const userId = session.user.id;

  const [journals, notes] = await Promise.all([
    DailyJournal.find({
      userId,
      $or: [{ title: rx }, { content: rx }, { tags: rx }],
    })
      .select("date mood title content")
      .sort({ date: -1 })
      .limit(40)
      .lean(),
    QuickNote.find({ userId, content: rx })
      .select("date content type createdAt")
      .sort({ createdAt: -1 })
      .limit(60)
      .lean(),
  ]);

  // Group everything by date.
  const byDate = {};
  for (const j of journals) {
    byDate[j.date] = byDate[j.date] || { date: j.date, journal: null, notes: [] };
    byDate[j.date].journal = {
      mood: j.mood,
      title: j.title,
      snippet: (j.content || "").slice(0, 160),
    };
  }
  for (const n of notes) {
    byDate[n.date] = byDate[n.date] || { date: n.date, journal: null, notes: [] };
    byDate[n.date].notes.push({ content: n.content, type: n.type });
  }

  const results = Object.values(byDate).sort((a, b) =>
    b.date.localeCompare(a.date)
  );
  return NextResponse.json({ results });
}
