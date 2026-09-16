import { startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";
import { withRoute, json } from "@/lib/api";
import { z } from "@/lib/validation";
import { toDateKey } from "@/lib/utils";
import {
  getJournalDay,
  getCalendarMoods,
  getRecentEntries,
} from "@/features/journal/actions";

const Query = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date.")
    .optional(),
});

/**
 * GET /api/journal/screen?date=YYYY-MM-DD — the day, its calendar month and
 * the recent-entries list, in one request.
 *
 * `date` comes from the browser and should: "today" on a Vercel server is
 * today in UTC, which is the previous day for most of a Nepali evening. The
 * default is a fallback for a caller that has no clock to offer, not the
 * normal path.
 */
export const GET = withRoute(
  { limit: "read", db: false, query: Query },
  async ({ query }) => {
    const date = query.date ?? toDateKey();
    const now = new Date(`${date}T12:00:00`);
    // The calendar grid shows whole weeks, so it reaches into the months
    // either side of this one.
    const from = toDateKey(startOfWeek(startOfMonth(now), { weekStartsOn: 1 }));
    const to = toDateKey(endOfWeek(endOfMonth(now), { weekStartsOn: 1 }));

    // Each fetcher connects and resolves the session itself.
    const [day, calendar, recents] = await Promise.all([
      getJournalDay(date),
      getCalendarMoods(from, to),
      getRecentEntries(),
    ]);

    return json({ date, ...day, calendar, recents });
  }
);
