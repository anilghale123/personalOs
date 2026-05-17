import mongoose from "mongoose";

const MilestoneSchema = new mongoose.Schema({
  title: { type: String, required: true },
  targetValue: Number, // e.g., 120 (hours of reading practice)
  currentValue: { type: Number, default: 0 },
  unit: String, // e.g., 'hours', 'band score', 'pages'
  dueDate: Date,
  isComplete: { type: Boolean, default: false },
  notes: String,
});

const GoalSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: { type: String, required: true }, // e.g., 'IELTS Preparation'
    category: {
      type: String,
      enum: ["study", "health", "finance", "career", "personal"],
      required: true,
    },
    targetDate: Date,
    overallProgress: { type: Number, default: 0 }, // 0–100 percent, auto-computed
    milestones: [MilestoneSchema],
    // Band score tracking (IELTS-style structured sub-scores)
    subScores: [
      {
        label: String, // 'Reading', 'Writing', 'Speaking', 'Listening'
        target: Number, // e.g., 7.0
        current: Number, // e.g., 6.5
      },
    ],
    isArchived: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Auto-compute overallProgress before save
GoalSchema.pre("save", function (next) {
  if (this.milestones.length > 0) {
    const completed = this.milestones.filter((m) => m.isComplete).length;
    this.overallProgress = Math.round(
      (completed / this.milestones.length) * 100
    );
  }
  next();
});

export default mongoose.models.Goal || mongoose.model("Goal", GoalSchema);
