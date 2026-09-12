import mongoose from "mongoose";
import { withRoute, json } from "@/lib/api";
import { z, dateKey } from "@/lib/validation";
import DailyJournal from "@/models/DailyJournal";
import QuickNote from "@/models/QuickNote";

/**
 * GET /api/journal/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * One entry per day that has anything on it — mood, a title, long-form
 * content, or quick notes — for painting the month grid.
 */
export const GET = withRoute(
  { limit: "read", query: z.object({ from: dateKey, to: dateKey }) },
  async ({ userId, query }) => {
    const { from, to } = query;

    // Cast by hand for the aggregation: `find()` runs values through the
    // schema and casts a hex string to an ObjectId, but `aggregate()` does
    // not — a string here would match nothing at all, silently, and every
    // day would report zero notes.
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const [journals, noteCounts] = await Promise.all([
      DailyJournal.find({ userId, date: { $gte: from, $lte: to } })
        .select("date mood content title")
        .lean(),
      QuickNote.aggregate([
        {
          $match: {
            userId: userObjectId,
            date: { $gte: from, $lte: to },
            // Soft-deleted notes were being counted, so a day whose only
            // notes had been deleted still showed a note badge.
            deletedAt: null,
          },
        },
        { $group: { _id: "$date", count: { $sum: 1 } } },
      ]),
    ]);

    const noteMap = Object.fromEntries(noteCounts.map((n) => [n._id, n.count]));

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

    return json({ calendar });
  }
);
