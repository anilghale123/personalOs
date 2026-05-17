import mongoose from "mongoose";

const ChecklistItemSchema = new mongoose.Schema({
  text: { type: String, required: true },
  dayTarget: {
    type: String,
    enum: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "daily", "any"],
    default: "any",
  },
  completedDates: [String], // ['2025-05-12', '2025-05-13'] — dates completed
  isComplete: { type: Boolean, default: false },
});

const WeeklyGoalSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: { type: String, required: true }, // e.g., 'IELTS Speaking Practice'
    category: {
      type: String,
      enum: ["study", "health", "finance", "work", "personal"],
      default: "personal",
    },
    weekStart: { type: Date, required: true }, // Monday 00:00
    weekEnd: { type: Date, required: true }, // Sunday 23:59
    checklistItems: [ChecklistItemSchema],
    // End-of-week evaluation
    evaluation: {
      completionRate: Number, // 0–100
      reflection: String, // User's written review
      rating: { type: Number, min: 1, max: 5 }, // Self-rating
      evaluatedAt: Date,
    },
    color: {
      type: String,
      enum: ["blue", "green", "amber", "red", "purple", "pink"],
      default: "blue",
    },
  },
  { timestamps: true }
);

// Auto-compute completion rate before save
WeeklyGoalSchema.pre("save", function (next) {
  if (this.checklistItems.length > 0) {
    const done = this.checklistItems.filter((i) => i.isComplete).length;
    if (this.evaluation) {
      this.evaluation.completionRate = Math.round(
        (done / this.checklistItems.length) * 100
      );
    }
  }
  next();
});

WeeklyGoalSchema.index({ userId: 1, weekStart: 1, weekEnd: 1 });

export default mongoose.models.WeeklyGoal ||
  mongoose.model("WeeklyGoal", WeeklyGoalSchema);
