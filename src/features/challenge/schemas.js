import { z } from "@/lib/validation";

/**
 * The zod shapes shared by the challenge routes. Kept in one place because
 * the create and the edit both carry a tracker tree, and the two must agree
 * field for field or the builder could send one thing and the Setup tab
 * another.
 */

export const METRICS = ["minutes", "count", "check"];
export const RAMPS = ["linear", "percent"];
export const DIRECTIONS = ["increase", "decrease"];
export const COLORS = ["blue", "green", "amber", "red", "purple", "pink"];
export const STATUSES = ["active", "completed", "abandoned"];

/**
 * One tracker as the client sends it.
 *
 * A tracker being edited carries its `_id`; one being added carries a `key`
 * (a short id the form invents) so that siblings can point at it as their
 * parent before any of them exist in the database. A blank parent is "no
 * parent".
 */
export const TrackerIn = z.object({
  _id: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
  key: z.string().min(1).max(40).optional(),
  parentId: z
    .union([z.string().min(1), z.null()])
    .optional()
    .transform((v) => (v === "" || v == null ? null : v)),
  name: z.string().max(80).transform((s) => s.trim()).pipe(z.string().min(1, "Give it a name.")),
  metric: z.enum(METRICS),
  unit: z.string().max(20).optional().transform((v) => (v ? v.trim() : null)),
  rollup: z.boolean().optional().default(false),
  useSets: z.boolean().optional().default(false),
  baseline: z.union([z.number().finite(), z.null()]).optional().default(null),
  goal: z.union([z.number().finite().nonnegative(), z.null()]).optional().default(null),
  rampType: z.enum(RAMPS).optional().default("linear"),
  direction: z.enum(DIRECTIONS).optional().default("increase"),
  startDay: z.number().int().min(1).max(365).optional(),
  archived: z.boolean().optional(),
});

/**
 * A tracker list that must contain at least one top-level habit, and must
 * name at most three levels. Depth is checked structurally here (cheap) and
 * re-checked authoritatively by the model hook (which can follow real ids).
 */
export function trackerList(minTop = 1) {
  return z
    .array(TrackerIn)
    .max(60)
    .refine((list) => list.length >= minTop, "Add at least one habit.")
    .refine((list) => list.some((t) => t.parentId === null), "Every habit needs a top level.")
    .refine(depthOk, "A habit, its items and their variations is the deepest a tree may go.");
}

/** Walk parent pointers; fail if any chain is longer than two hops. */
function depthOk(list) {
  const byKey = new Map();
  for (const t of list) {
    byKey.set(t._id ?? t.key, t);
  }
  for (const t of list) {
    let hops = 0;
    let cur = t;
    const guard = new Set();
    while (cur && cur.parentId) {
      if (guard.has(cur._id ?? cur.key)) return false; // a loop
      guard.add(cur._id ?? cur.key);
      cur = byKey.get(cur.parentId);
      hops += 1;
      if (hops > 2) return false;
    }
  }
  return true;
}

export const CreateChallenge = z.object({
  title: z.string().max(120).transform((s) => s.trim()).pipe(z.string().min(1, "A title is required.")),
  description: z.string().max(500).optional().transform((v) => (v ? v.trim() : undefined)),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a start date."),
  totalDays: z.number().int().min(1).max(365, "Challenges run at most 365 days."),
  color: z.enum(COLORS).optional().default("blue"),
  trackers: trackerList(1),
});

export const UpdateChallenge = z
  .object({
    title: z.string().max(120).transform((s) => s.trim()).optional(),
    description: z
      .string()
      .max(500)
      .optional()
      .transform((v) => (v ? v.trim() : undefined)),
    status: z.enum(STATUSES).optional(),
    color: z.enum(COLORS).optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a start date.").optional(),
    totalDays: z.number().int().min(1).max(365).optional(),
    trackers: z.array(TrackerIn).max(60).optional(),
  })
  .refine(
    (v) =>
      v.title !== undefined ||
      v.description !== undefined ||
      v.status !== undefined ||
      v.color !== undefined ||
      v.startDate !== undefined ||
      v.totalDays !== undefined ||
      v.trackers !== undefined,
    "Nothing to update."
  );

/** A log entry as the client sends it for one tracker. */
export const EntryIn = z.object({
  trackerId: z.string().regex(/^[0-9a-fA-F]{24}$/),
  value: z.union([z.number().finite(), z.null()]).optional().default(null),
  sets: z.array(z.number().finite()).max(40).optional(),
  done: z.boolean().optional().default(false),
});

export const SaveLog = z.object({
  entries: z.array(EntryIn).max(80),
  note: z.string().max(500).optional().transform((v) => (v ? v.trim() : undefined)),
});

export const LogsQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const ChallengesQuery = z.object({
  status: z.enum(STATUSES).optional(),
});
