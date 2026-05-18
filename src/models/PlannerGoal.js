import mongoose from "mongoose";

/** Per-day completion status for one goal. */
const dayField = () => ({
  type: String,
  enum: ["pending", "done", "missed"],
  default: "pending",
});

/**
 * A weekly planner goal — a row in the planner grid. Each goal carries
 * a done/missed/pending status for every day of its (Monday-anchored)
 * week.
 */
const PlannerGoalSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    weekStart: { type: String, required: true }, // 'YYYY-MM-DD' — the Monday
    title: { type: String, required: true, trim: true },
    days: {
      Mon: dayField(),
      Tue: dayField(),
      Wed: dayField(),
      Thu: dayField(),
      Fri: dayField(),
      Sat: dayField(),
      Sun: dayField(),
    },
  },
  { timestamps: true }
);

PlannerGoalSchema.index({ userId: 1, weekStart: 1 });

export default mongoose.models.PlannerGoal ||
  mongoose.model("PlannerGoal", PlannerGoalSchema);
