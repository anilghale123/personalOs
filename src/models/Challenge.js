import mongoose from "mongoose";

/**
 * One habit (or a sub-item / variation of one) inside a challenge.
 *
 * The tree is stored **flat**, linked by `parentId`, rather than as nested
 * sub-schemas. A flat list keeps log entries, edits and archiving simple:
 * every node is addressed by its own id, so a log entry can point at a leaf
 * three levels deep without any path arithmetic.
 *
 * A challenge is at most three levels deep:
 *
 *     Exercise (minutes, logged directly)
 *     ├── Push-ups (count, rollup of the variations below)
 *     │   ├── Normal (count, sets)
 *     │   └── Diamond (count, sets)
 *     └── Sit-ups (count, sets)
 */
const TrackerSchema = new mongoose.Schema(
  {
    // null = a top-level habit. Must point at a tracker in the same
    // challenge — enforced by the pre-validate hook, not the schema,
    // because a subdocument array cannot express a cross-reference.
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    name: { type: String, required: true },
    metric: {
      type: String,
      enum: ["minutes", "count", "check"],
      required: true,
    },
    // Optional display label: "reps", "pages", "km" …
    unit: String,
    // Rollup: true  → value = sum of children (children must share the
    //   metric); the parent is never logged directly.
    //   false → logged directly (e.g. "Exercise" total minutes), and its
    //   children are logged too.
    rollup: { type: Boolean, default: false },
    // Sets are tracked on leaves only: `sets: [10, 12, 10]`, value = the sum.
    useSets: { type: Boolean, default: false },
    // null = calibrate from the first log (no target until then).
    baseline: { type: Number, default: null },
    // The target on the final day. Required for count/minutes, ignored
    // for "check" (whose target is always 1).
    goal: Number,
    rampType: {
      type: String,
      enum: ["linear", "percent"],
      default: "linear",
    },
    // For things that should go down (screen time, resting heart rate).
    direction: {
      type: String,
      enum: ["increase", "decrease"],
      default: "increase",
    },
    // Day it was added. 1 for trackers created with the challenge; later
    // when one is added mid-challenge, so its ramp runs over the rest.
    startDay: { type: Number, default: 1 },
    order: { type: Number, default: 0 },
    // Removed trackers that still have logs are archived, not deleted, so
    // past days keep making sense.
    archived: { type: Boolean, default: false },
  },
  { _id: true }
);

const ChallengeSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: { type: String, required: true }, // "88-Day Reset"
    description: String,
    // 'YYYY-MM-DD' — the same local calendar-date style as PlannerGoal.
    startDate: { type: String, required: true },
    totalDays: { type: Number, required: true, min: 1, max: 365 },
    status: {
      type: String,
      enum: ["active", "completed", "abandoned"],
      default: "active",
    },
    // Same palette as WeeklyGoal.
    color: {
      type: String,
      enum: ["blue", "green", "amber", "red", "purple", "pink"],
      default: "blue",
    },
    trackers: [TrackerSchema],
  },
  { timestamps: true }
);

/**
 * Structural rules the schema cannot express.
 *
 * Run on the whole document, because the rules look across the flat list
 * (a parent's children, the depth of a chain, metric agreement) and a
 * subdocument hook sees one node at a time.
 */
ChallengeSchema.pre("validate", function () {
  const list = this.trackers || [];
  const byId = new Map();
  for (const t of list) byId.set(t._id.toString(), t);

  const errors = [];

  // Depth + parent existence. A parent that is not in the list (or a chain
  // that loops) would otherwise be silently accepted and later break every
  // query that walks the tree.
  for (const t of list) {
    if (!t.parentId) continue;
    if (!byId.has(t.parentId.toString())) {
      errors.push(`${t.name}: its parent does not exist.`);
      continue;
    }
    let depth = 0;
    let cursor = t;
    const seen = new Set();
    while (cursor.parentId) {
      depth += 1;
      const key = cursor._id.toString();
      if (seen.has(key)) {
        errors.push(`${t.name}: the hierarchy loops back on itself.`);
        break;
      }
      seen.add(key);
      cursor = byId.get(cursor.parentId.toString());
      if (!cursor) break;
    }
    if (depth > 2) {
      errors.push(`${t.name}: items can be at most three levels deep.`);
    }
  }

  // A rollup parent must have children, and they must share its metric. An
  // archived rollup is exempt: removing every child archives the parent too,
  // and its past logs (which may have used it) must still resolve.
  for (const t of list) {
    if (!t.rollup || t.archived) continue;
    const children = list.filter(
      (c) => c.parentId && c.parentId.equals(t._id)
    );
    if (children.length === 0) {
      errors.push(
        `${t.name}: a "total of sub-items" needs at least one sub-item.`
      );
    } else if (children.some((c) => c.metric !== t.metric)) {
      errors.push(`${t.name}: its sub-items must all use ${t.metric}.`);
    }
  }

  // Sets are a leaf-only concept, and only for things that have a number.
  for (const t of list) {
    if (!t.useSets) continue;
    const hasChildren = list.some(
      (c) => c.parentId && c.parentId.equals(t._id)
    );
    if (hasChildren) {
      errors.push(`${t.name}: sets can only be tracked on a final item.`);
    } else if (t.metric === "check") {
      errors.push(`${t.name}: a yes/no habit cannot be counted in sets.`);
    }
  }

  // count and minutes trackers need a goal to ramp toward; a check never
  // does, and a rollup's goal is the sum of its children's, so it is not
  // required of one.
  for (const t of list) {
    if (t.metric === "check" || t.rollup) continue;
    if (t.goal === undefined || t.goal === null) {
      errors.push(`${t.name}: set the goal for the final day.`);
    }
  }

  if (errors.length) {
    const err = new Error(errors.join(" "));
    err.errors = {};
    err.name = "ValidationError";
    throw err;
  }
});

ChallengeSchema.index({ userId: 1, status: 1 });

export default mongoose.models.Challenge ||
  mongoose.model("Challenge", ChallengeSchema);
