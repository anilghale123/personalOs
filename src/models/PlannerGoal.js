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
    /**
     * Optional 'HH:mm' (24-hour, Nepal time) the goal should be done by on
     * each day. The day comes from the grid column, so one time covers the
     * whole week. A goal still pending once this passes gets a push nudge;
     * a goal without a time never does.
     */
    time: { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    /** 'YYYY-MM-DD' the time nudge last went out, so it fires once a day. */
    timeRemindedOn: { type: String },
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
// The goal-time reminder run scans one week's timed goals across all users.
PlannerGoalSchema.index({ weekStart: 1, time: 1 });

export default mongoose.models.PlannerGoal ||
  mongoose.model("PlannerGoal", PlannerGoalSchema);
