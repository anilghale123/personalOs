import { withRoute, json, must } from "@/lib/api";
import { z, optionalText } from "@/lib/validation";
import { invalidateHabits } from "@/lib/cache";
import WeeklyGoal from "@/models/WeeklyGoal";

const Evaluation = z.object({
  // The schema declares min 1 / max 5; unvalidated input reached it as a
  // Mongoose ValidationError surfacing as a 500.
  rating: z.coerce.number().int().min(1).max(5),
  reflection: optionalText(4000),
  completionRate: z.coerce.number().min(0).max(100).optional(),
});

/**
 * PATCH — record the end-of-week evaluation for a weekly goal.
 * Body: { rating, reflection?, completionRate? }
 */
export const PATCH = withRoute(
  { limit: "write", params: ["id"], body: Evaluation },
  async ({ userId, params, input }) => {
    must(
      await WeeklyGoal.findOneAndUpdate(
        { _id: params.id, userId },
        {
          $set: {
            evaluation: {
              rating: input.rating,
              reflection: input.reflection,
              completionRate: input.completionRate,
              evaluatedAt: new Date(),
            },
          },
        },
        { new: true, runValidators: true }
      ).lean()
    );

    invalidateHabits(userId);

    return json({ ok: true });
  }
);
