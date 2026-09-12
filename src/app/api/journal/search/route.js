import { withRoute, json } from "@/lib/api";
import { z } from "@/lib/validation";
import DailyJournal from "@/models/DailyJournal";
import QuickNote from "@/models/QuickNote";
import { searchRegex } from "@/lib/utils";

/**
 * GET /api/journal/search?q=term
 * Searches daily journals (title, content, tags) and quick notes
 * (content). Results are grouped by day, most recent first.
 */
export const GET = withRoute(
  { limit: "read", query: z.object({ q: z.string().max(64).optional() }) },
  async ({ userId, query }) => {
  // Escaped and length-capped before it ever reaches a RegExp constructor.
  const rx = searchRegex(query.q, 2);
  if (!rx) return json({ results: [] });

  const [journals, notes] = await Promise.all([
    DailyJournal.find({
      userId,
      $or: [{ title: rx }, { content: rx }, { tags: rx }],
    })
      .select("date mood title content")
      .sort({ date: -1 })
      .limit(40)
      .lean(),
    QuickNote.find({ userId, content: rx, deletedAt: null })
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
  return json({ results });
  }
);
