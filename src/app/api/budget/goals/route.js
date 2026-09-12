import { withRoute, json } from "@/lib/api";
import { z, amountMajor, optionalDateKey, optionalText, text } from "@/lib/validation";
import { invalidateMoney } from "@/lib/cache";
import FinancialGoal from "@/models/FinancialGoal";

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour.")
  .optional();

/** GET /api/budget/goals — savings goals for the current user. */
export const GET = withRoute({ limit: "read" }, async ({ userId }) => {
  const goals = await FinancialGoal.find({ userId })
    .sort({ status: 1, createdAt: -1 })
    .lean();
  return json(goals);
});

const CreateGoal = z.object({
  name: text(80).pipe(z.string().min(1, "A goal name is required.")),
  target: amountMajor,
  icon: z.string().max(8).optional(),
  color: hexColor,
  targetDate: optionalDateKey,
  note: optionalText(300),
});

/**
 * POST /api/budget/goals — create a savings goal.
 * Body: { name, target, icon?, color?, targetDate?, note? }
 */
export const POST = withRoute(
  { limit: "write", body: CreateGoal },
  async ({ userId, input }) => {
    const goal = await FinancialGoal.create({
      userId,
      name: input.name,
      icon: input.icon || "🎯",
      color: input.color || "#16a34a",
      targetPaisa: input.target,
      targetDate: input.targetDate,
      note: input.note,
    });

    invalidateMoney(userId);

    return json(goal, { status: 201 });
  }
);
