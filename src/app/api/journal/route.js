import { withRoute, json } from "@/lib/api";
import { z, dateKey, text, optionalText, tagList } from "@/lib/validation";
import { invalidateJournal } from "@/lib/cache";
import DailyJournal from "@/models/DailyJournal";
import QuickNote from "@/models/QuickNote";

const MOODS = ["amazing", "good", "okay", "bad", "awful"];

const ReadQuery = z.object({
  date: dateKey,
  notesLimit: z.coerce.number().int().positive().max(500).catch(200),
  notesSkip: z.coerce.number().int().min(0).max(100_000).catch(0),
});

/**
 * GET /api/journal?date=YYYY-MM-DD
 * Returns the daily anchor journal and a page of quick notes for a day.
 */
export const GET = withRoute(
  { limit: "read", query: ReadQuery },
  async ({ userId, query }) => {
    const { date, notesLimit, notesSkip } = query;

    const [journal, notes, notesTotal] = await Promise.all([
      DailyJournal.findOne({ userId, date }).lean(),
      QuickNote.find({ userId, date, deletedAt: null })
        .sort({ createdAt: 1 })
        .skip(notesSkip)
        .limit(notesLimit)
        .lean(),
      QuickNote.countDocuments({ userId, date, deletedAt: null }),
    ]);

    return json({
      journal: journal || null,
      notes,
      notesTotal,
      notesHasMore: notesSkip + notes.length < notesTotal,
    });
  }
);

const SaveJournal = z.object({
  date: dateKey,
  // Nullable: clearing a mood is meaningful, and the schema allows null.
  mood: z.enum(MOODS).nullish(),
  title: text(200).optional(),
  // Capped. Journal content is documented as Markdown, so the day anything
  // renders it as such an unbounded field becomes an injection surface too.
  content: text(100_000).optional(),
  tags: tagList.optional(),
});

/**
 * PUT /api/journal
 * Autosave upsert for the daily anchor journal.
 * Body: { date, mood, title, content, tags }
 */
export const PUT = withRoute(
  { limit: "write", body: SaveJournal },
  async ({ userId, input }) => {
    const set = {
      mood: input.mood ?? null,
      title: input.title ?? "",
      content: input.content ?? "",
      tags: input.tags ?? [],
    };

    /**
     * `upsert` races with itself on a day's first write — two autosaves
     * landing together both try to insert. The unique {userId, date} index
     * catches that, and the duplicate-key retry below turns it into a plain
     * update rather than a failed save the user never sees.
     */
    let journal;
    try {
      journal = await DailyJournal.findOneAndUpdate(
        { userId, date: input.date },
        { $set: set, $setOnInsert: { userId, date: input.date } },
        { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
      ).lean();
    } catch (err) {
      if (err.code !== 11000) throw err;
      journal = await DailyJournal.findOneAndUpdate(
        { userId, date: input.date },
        { $set: set },
        { new: true }
      ).lean();
    }

    invalidateJournal(userId);

    return json(journal);
  }
);
