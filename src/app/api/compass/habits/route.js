import { withRoute, json } from "@/lib/api";
import { z, dateKey, text, optionalText, positiveNumber } from "@/lib/validation";
import { cachedReference, invalidateHabits, tags } from "@/lib/cache";
import HabitLog from "@/models/HabitLog";

/** Normalise a 'YYYY-MM-DD' string to a UTC-midnight Date. */
function utcMidnight(dateStr) {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

/** A year back from today, as the heatmap window. */
function oneYearAgo() {
  const since = new Date();
  since.setFullYear(since.getFullYear() - 1);
  return since;
}

/**
 * GET — habit logs for the past year (optionally filtered by ?habit=).
 *
 * Cached as reference data on a short TTL: a year of logs is the single
 * biggest read in the app and it feeds the heatmap on two screens, but a
 * habit ticked seconds ago appearing on the next render is handled by the
 * tag invalidation on write rather than by refetching every visit.
 */
export const GET = withRoute(
  {
    limit: "read",
    query: z.object({ habit: z.string().max(120).optional() }),
  },
  async ({ userId, query }) => {
    const logs = await cachedReference(
      () => {
        const filter = { userId, date: { $gte: oneYearAgo() } };
        if (query.habit) filter.habitName = query.habit;
        return HabitLog.find(filter)
          .select("date completed value habitName note")
          .lean();
      },
      {
        userId,
        key: "habit-logs-year",
        deps: [query.habit ?? "all"],
        tags: [tags.habits(userId)],
        seconds: 60,
      }
    );
    return json(logs);
  }
);

const LogHabit = z.object({
  habitName: text(120).pipe(z.string().min(1, "Name the habit.")),
  date: dateKey,
  completed: z.boolean().optional(),
  /**
   * An optional measurement — km run, minutes meditated. Previously any type
   * at all was accepted and written straight through, so a string or NaN
   * became a stored value the heatmap then tried to chart.
   */
  value: positiveNumber(1e6).optional(),
  unit: optionalText(20),
  note: optionalText(500),
});

/**
 * POST — upsert a habit log for a given day.
 * Body: { habitName, date: 'YYYY-MM-DD', completed?, value?, unit?, note? }
 */
export const POST = withRoute(
  { limit: "write", body: LogHabit },
  async ({ userId, input }) => {
    const log = await HabitLog.findOneAndUpdate(
      {
        userId,
        habitName: input.habitName,
        // The date is validated as a real calendar day before it gets here;
        // an unvalidated one produced an Invalid Date and a CastError 500.
        date: utcMidnight(input.date),
      },
      {
        $set: {
          completed: Boolean(input.completed),
          ...(input.value !== undefined ? { value: input.value } : {}),
          ...(input.unit !== undefined ? { unit: input.unit } : {}),
          ...(input.note !== undefined ? { note: input.note } : {}),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    ).lean();

    invalidateHabits(userId);

    return json(log);
  }
);
