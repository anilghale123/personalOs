import mongoose from "mongoose";

const HabitLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    habitName: { type: String, required: true }, // e.g., 'Morning Run'
    date: { type: Date, required: true }, // Store as UTC midnight for consistent grouping
    completed: { type: Boolean, default: false },
    value: Number, // Optional: e.g., 5.2 (km run), 30 (mins meditated)
    unit: String, // e.g., 'km', 'minutes'
    note: String,
  },
  { timestamps: true }
);

// Compound index: one log per habit per day per user
HabitLogSchema.index(
  { userId: 1, habitName: 1, date: 1 },
  { unique: true }
);

// Index for heatmap queries (range scans over date)
HabitLogSchema.index({ userId: 1, date: 1 });

export default mongoose.models.HabitLog ||
  mongoose.model("HabitLog", HabitLogSchema);
