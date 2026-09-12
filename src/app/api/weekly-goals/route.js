import { withRoute, json } from "@/lib/api";
import { z, text } from "@/lib/validation";
import { invalidateHabits } from "@/lib/cache";
import WeeklyGoal from "@/models/WeeklyGoal";
import { weekRange } from "@/lib/week";

const CATEGORIES = ["study", "health", "finance", "work", "personal"];
const COLORS = ["blue", "green", "amber", "red", "purple", "pink"];

/** GET — weekly goals overlapping the current week. */
export const GET = withRoute({ limit: "read" }, async ({ userId }) => {
  const { weekStart, weekEnd } = weekRange();
  const goals = await WeeklyGoal.find({
    userId,
    weekStart: { $lte: weekEnd },
    weekEnd: { $gte: weekStart },
  })
    .sort({ createdAt: -1 })
    .lean();
  return json(goals);
});

const CreateWeeklyGoal = z.object({
  title: text(200).pipe(z.string().min(1, "A title is required.")),
  category: z.enum(CATEGORIES).catch("personal"),
  color: z.enum(COLORS).catch("blue"),
  // Capped: checklist items are subdocuments in one document, so an
  // unbounded array grows the parent without limit.
  items: z
    .array(z.string().max(300))
    .min(1, "Add at least one checklist item.")
    .max(50)
    .transform((items) => items.map((t) => t.trim()).filter(Boolean))
    .refine((items) => items.length > 0, "Add at least one checklist item."),
});

/**
 * POST — create a weekly goal for the current week.
 * Body: { title, category?, items: string[], color? }
 */
export const POST = withRoute(
  { limit: "write", body: CreateWeeklyGoal },
  async ({ userId, input }) => {
    const { weekStart, weekEnd } = weekRange();

    const goal = await WeeklyGoal.create({
      userId,
      title: input.title,
      category: input.category,
      color: input.color,
      weekStart,
      weekEnd,
      checklistItems: input.items.map((t) => ({ text: t, isComplete: false })),
    });

    invalidateHabits(userId);

    return json(goal, { status: 201 });
  }
);
