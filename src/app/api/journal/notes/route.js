import { withRoute, json } from "@/lib/api";
import { z, dateKey, text } from "@/lib/validation";
import { invalidateJournal } from "@/lib/cache";
import { NOTE_TYPES } from "@/features/patterns/constants";
import DailyJournal from "@/models/DailyJournal";
import QuickNote from "@/models/QuickNote";

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

const ListQuery = z.object({
  date: dateKey,
  limit: z.coerce.number().int().positive().max(500).catch(200),
  skip: z.coerce.number().int().min(0).max(100_000).catch(0),
});

/**
 * GET /api/journal/notes?date=YYYY-MM-DD&limit=&skip=
 * Paginated quick notes for a day (oldest first).
 */
export const GET = withRoute(
  { limit: "read", query: ListQuery },
  async ({ userId, query }) => {
    const notes = await QuickNote.find({
      userId,
      date: query.date,
      deletedAt: null,
    })
      .sort({ createdAt: 1 })
      .skip(query.skip)
      .limit(query.limit)
      .lean();
    return json(notes);
  }
);

const CreateNote = z.object({
  date: dateKey,
  content: text(5000).pipe(z.string().min(1, "Note content is required.")),
  type: z.enum(NOTE_TYPES).catch("note"),
});

/**
 * POST /api/journal/notes
 * Instantly capture a quick note. Auto-creates the day's DailyJournal.
 * Body: { date, content, type }
 */
export const POST = withRoute(
  { limit: "write", body: CreateNote },
  async ({ userId, input }) => {
    const journal = await ensureDailyJournal(userId, input.date);

    const note = await QuickNote.create({
      journalId: journal._id,
      userId,
      date: input.date,
      content: input.content,
      type: input.type,
    });

    invalidateJournal(userId);

    return json(note, { status: 201 });
  }
);
