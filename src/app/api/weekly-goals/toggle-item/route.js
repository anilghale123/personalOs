import { withRoute, json, must } from "@/lib/api";
import { z, dateKey, objectId } from "@/lib/validation";
import { invalidateHabits } from "@/lib/cache";
import WeeklyGoal from "@/models/WeeklyGoal";

const ToggleItem = z.object({
  goalId: objectId,
  itemId: objectId,
  completed: z.boolean(),
  date: dateKey,
});

/**
 * PATCH — toggle a checklist item's completion.
 *
 * `$addToSet`/`$pull` on `completedDates` rather than a read-modify-write, so
 * ticking the same item from two tabs cannot lose one of the dates. The date
 * is now validated: an unchecked one was stored verbatim into the array and
 * then compared against real date keys that could never match it.
 *
 * Body: { goalId, itemId, completed, date }
 */
export const PATCH = withRoute(
  { limit: "write", body: ToggleItem },
  async ({ userId, input }) => {
    const update = input.completed
      ? {
          $set: { "checklistItems.$.isComplete": true },
          $addToSet: { "checklistItems.$.completedDates": input.date },
        }
      : {
          $set: { "checklistItems.$.isComplete": false },
          $pull: { "checklistItems.$.completedDates": input.date },
        };

    must(
      await WeeklyGoal.findOneAndUpdate(
        {
          _id: input.goalId,
          userId,
          "checklistItems._id": input.itemId,
        },
        update,
        { new: true }
      ).lean()
    );

    invalidateHabits(userId);

    return json({ ok: true });
  }
);
