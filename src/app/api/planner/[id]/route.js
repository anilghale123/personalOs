import { withRoute, json, must } from "@/lib/api";
import { z, clearable, clockTime, text } from "@/lib/validation";
import { invalidatePlanner } from "@/lib/cache";
import PlannerGoal from "@/models/PlannerGoal";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const STATUS = ["pending", "done", "missed"];

const UpdateRow = z
  .object({
    title: text(200).pipe(z.string().min(1, "Goal title cannot be empty.")).optional(),
    day: z.enum(DAYS).optional(),
    status: z.enum(STATUS).optional(),
    // null (or blank) removes the time, and with it the reminder.
    time: clearable(clockTime),
  })
  // A day without a status (or the reverse) would build a `days.undefined`
  // path and silently write a field nothing reads.
  .refine((v) => (v.day === undefined) === (v.status === undefined), {
    message: "Setting a day needs both a day and a status.",
  })
  .refine((v) => v.title !== undefined || v.day !== undefined || v.time !== undefined, {
    message: "Nothing to update.",
  });

/**
 * PATCH /api/planner/[id]
 * Rename a goal, set or clear its reminder time, or set one day's status.
 * Body: { title? }, { time? } and/or { day, status }
 */
export const PATCH = withRoute(
  { limit: "write", params: ["id"], body: UpdateRow },
  async ({ userId, params, input }) => {
    const update = {};
    if (input.title !== undefined) update.title = input.title;
    if (input.day !== undefined) update[`days.${input.day}`] = input.status;
    const unset = {};
    if (input.time !== undefined) {
      // A new time is a new deadline — today's nudge may be due again.
      unset.timeRemindedOn = "";
      if (input.time === null) unset.time = "";
      else update.time = input.time;
    }

    const goal = must(
      await PlannerGoal.findOneAndUpdate(
        { _id: params.id, userId },
        { $set: update, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
        { new: true, runValidators: true }
      ).lean()
    );

    invalidatePlanner(userId);

    return json(goal);
  }
);

/** DELETE /api/planner/[id] */
export const DELETE = withRoute(
  { limit: "write", params: ["id"] },
  async ({ userId, params }) => {
    const res = await PlannerGoal.deleteOne({ _id: params.id, userId });
    must(res.deletedCount ? res : null);

    invalidatePlanner(userId);

    return json({ ok: true });
  }
);
