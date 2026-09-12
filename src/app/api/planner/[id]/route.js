import { withRoute, json, must } from "@/lib/api";
import { z, text } from "@/lib/validation";
import { invalidatePlanner } from "@/lib/cache";
import PlannerGoal from "@/models/PlannerGoal";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const STATUS = ["pending", "done", "missed"];

const UpdateRow = z
  .object({
    title: text(200).pipe(z.string().min(1, "Goal title cannot be empty.")).optional(),
    day: z.enum(DAYS).optional(),
    status: z.enum(STATUS).optional(),
  })
  // A day without a status (or the reverse) would build a `days.undefined`
  // path and silently write a field nothing reads.
  .refine((v) => (v.day === undefined) === (v.status === undefined), {
    message: "Setting a day needs both a day and a status.",
  })
  .refine((v) => v.title !== undefined || v.day !== undefined, {
    message: "Nothing to update.",
  });

/**
 * PATCH /api/planner/[id]
 * Rename a goal, or set one day's completion status.
 * Body: { title? } and/or { day, status }
 */
export const PATCH = withRoute(
  { limit: "write", params: ["id"], body: UpdateRow },
  async ({ userId, params, input }) => {
    const update = {};
    if (input.title !== undefined) update.title = input.title;
    if (input.day !== undefined) update[`days.${input.day}`] = input.status;

    const goal = must(
      await PlannerGoal.findOneAndUpdate(
        { _id: params.id, userId },
        { $set: update },
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
