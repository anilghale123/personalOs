import { withRoute, json } from "@/lib/api";
import { z, blankAsAbsent, clockTime, dateKey, text } from "@/lib/validation";
import { invalidatePlanner } from "@/lib/cache";
import PlannerGoal from "@/models/PlannerGoal";
import { getPlannerWeek } from "@/features/planner/actions";

/**
 * GET /api/planner?weekStart=YYYY-MM-DD — goals for that week.
 * The first time a current/future week with no goals is opened, its
 * goal titles are copied forward from the most recent prior week
 * (see getPlannerWeek) so you don't have to re-add everything each
 * week — remove what you don't need and it stays removed.
 */
export const GET = withRoute(
  { limit: "read", db: false, query: z.object({ weekStart: dateKey }) },
  async ({ query }) => {
    // getPlannerWeek connects and re-checks the session itself.
    return json(await getPlannerWeek(query.weekStart));
  }
);

const CreateRow = z.object({
  weekStart: dateKey,
  title: text(200).pipe(z.string().min(1, "A goal title is required.")),
  time: blankAsAbsent(clockTime),
});

/**
 * POST /api/planner — add a goal row for a week.
 * Body: { weekStart, title, time? } — time is 'HH:mm'
 */
export const POST = withRoute(
  { limit: "write", body: CreateRow },
  async ({ userId, input }) => {
    const goal = await PlannerGoal.create({
      userId,
      weekStart: input.weekStart,
      title: input.title,
      ...(input.time ? { time: input.time } : {}),
    });

    invalidatePlanner(userId);

    return json(goal, { status: 201 });
  }
);
