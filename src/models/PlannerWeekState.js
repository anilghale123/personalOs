import mongoose from "mongoose";

/**
 * Tracks whether a user's planner week has already had its
 * carry-forward-from-last-week initialisation run, so we copy goal
 * titles forward exactly once per week — deletions after that stick
 * and are never re-added on the next page load.
 */
const PlannerWeekStateSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    weekStart: { type: String, required: true }, // 'YYYY-MM-DD' — the Monday
    carriedForward: { type: Boolean, default: false },
  },
  { timestamps: true }
);

PlannerWeekStateSchema.index({ userId: 1, weekStart: 1 }, { unique: true });

export default mongoose.models.PlannerWeekState ||
  mongoose.model("PlannerWeekState", PlannerWeekStateSchema);
