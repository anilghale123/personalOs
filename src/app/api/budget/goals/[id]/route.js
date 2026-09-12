import { withRoute, json, must } from "@/lib/api";
import { z, amountMajor, clearableDateKey, optionalText, text } from "@/lib/validation";
import { invalidateMoney } from "@/lib/cache";
import FinancialGoal from "@/models/FinancialGoal";

const UpdateGoal = z
  .object({
    name: text(80).pipe(z.string().min(1, "A goal name is required.")).optional(),
    target: amountMajor.optional(),
    icon: z.string().max(8).optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour.").optional(),
    // Three states: absent = leave it, blank = clear it, value = set it.
    targetDate: clearableDateKey,
    note: optionalText(300),
    status: z.enum(["active", "achieved", "archived"]).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "Nothing to update.",
  });

/**
 * PATCH /api/budget/goals/[id]
 * Body: any subset of { name, target, icon, color, targetDate, note, status }
 */
export const PATCH = withRoute(
  { limit: "write", params: ["id"], body: UpdateGoal },
  async ({ userId, params, input }) => {
    const update = {};
    const unset = {};

    if (input.name !== undefined) update.name = input.name;
    if (input.target !== undefined) update.targetPaisa = input.target;
    if (input.icon !== undefined) update.icon = input.icon;
    if (input.color !== undefined) update.color = input.color;
    if (input.note !== undefined) update.note = input.note;
    if (input.status !== undefined) update.status = input.status;

    // `$unset`, not `$set: undefined` — Mongoose strips undefined from `$set`,
    // so clearing a target date that way silently left the old one in place.
    if (input.targetDate === null) unset.targetDate = "";
    else if (input.targetDate !== undefined) update.targetDate = input.targetDate;

    const goal = must(
      await FinancialGoal.findOneAndUpdate(
        { _id: params.id, userId },
        {
          ...(Object.keys(update).length ? { $set: update } : {}),
          ...(Object.keys(unset).length ? { $unset: unset } : {}),
        },
        { new: true, runValidators: true }
      ).lean()
    );

    invalidateMoney(userId);

    return json(goal);
  }
);

/** DELETE /api/budget/goals/[id] — removes the goal and its contributions. */
export const DELETE = withRoute(
  { limit: "write", params: ["id"] },
  async ({ userId, params }) => {
    must(await FinancialGoal.findOneAndDelete({ _id: params.id, userId }).lean());

    invalidateMoney(userId);

    return json({ ok: true });
  }
);
