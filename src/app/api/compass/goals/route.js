import { withRoute, json, must, badRequest } from "@/lib/api";
import {
  z,
  finiteNumber,
  formatZodError,
  objectId,
  optionalText,
  text,
} from "@/lib/validation";
import { invalidateHabits } from "@/lib/cache";
import Goal from "@/models/Goal";

const CATEGORIES = ["study", "health", "finance", "career", "personal"];

const Milestone = z.object({
  title: text(200).pipe(z.string().min(1, "Name the milestone.")),
  targetValue: finiteNumber(-1e9, 1e9).optional(),
  currentValue: finiteNumber(-1e9, 1e9).optional(),
  unit: optionalText(20),
  dueDate: z.coerce.date().optional(),
  isComplete: z.boolean().optional(),
  notes: optionalText(1000),
});

const SubScore = z.object({
  label: text(60).optional(),
  target: finiteNumber(0, 1e6).optional(),
  current: finiteNumber(0, 1e6).optional(),
});

/** GET — all non-archived goals for the current user. */
export const GET = withRoute({ limit: "read" }, async ({ userId }) => {
  const goals = await Goal.find({ userId, isArchived: false })
    .sort({ createdAt: -1 })
    .lean();
  return json(goals);
});

const UpsertGoal = z.object({
  /** Present means "update this one"; absent means "create". */
  _id: objectId.optional(),
  title: text(200).optional(),
  category: z.enum(CATEGORIES).optional(),
  targetDate: z.coerce.date().optional(),
  // Capped counts: these are subdocument arrays inside one document, and an
  // unbounded array is a growing-document problem, not just a large payload.
  milestones: z.array(Milestone).max(100).optional(),
  subScores: z.array(SubScore).max(20).optional(),
  isArchived: z.boolean().optional(),
});

/**
 * POST — create a goal, or update milestones/sub-scores of an existing one.
 *
 * `.save()` rather than `findOneAndUpdate`, because the schema's pre-save hook
 * is what recomputes `overallProgress` from the milestones — an atomic update
 * would skip it and leave the progress bar stale.
 *
 * Body (create): { title, category, targetDate?, milestones?, subScores? }
 * Body (update): { _id, ...fields }
 */
export const POST = withRoute(
  { limit: "write", body: UpsertGoal },
  async ({ userId, input }) => {
    if (input._id) {
      // Scoped by userId: someone else's goal id reads as simply not found.
      const goal = must(await Goal.findOne({ _id: input._id, userId }));

      for (const key of [
        "title",
        "category",
        "targetDate",
        "milestones",
        "subScores",
        "isArchived",
      ]) {
        if (input[key] !== undefined) goal[key] = input[key];
      }

      await goal.save(); // triggers the progress recompute
      invalidateHabits(userId);
      return json(goal);
    }

    // Creating needs the two fields the schema requires.
    const parsed = z
      .object({
        title: text(200).pipe(z.string().min(1, "Give the goal a title.")),
        category: z.enum(CATEGORIES),
      })
      .safeParse(input);
    if (!parsed.success) throw badRequest(formatZodError(parsed.error));

    const goal = await Goal.create({
      userId,
      title: parsed.data.title,
      category: parsed.data.category,
      targetDate: input.targetDate,
      milestones: input.milestones ?? [],
      subScores: input.subScores ?? [],
    });

    invalidateHabits(userId);

    return json(goal, { status: 201 });
  }
);
