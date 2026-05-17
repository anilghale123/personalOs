import mongoose from "mongoose";

/**
 * QuickNote — a lightweight, timestamped thought attached to a day.
 * Many notes belong to one DailyJournal. `date` is denormalised from
 * the parent journal so day-scoped queries stay a single indexed read.
 */
const QuickNoteSchema = new mongoose.Schema(
  {
    journalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DailyJournal",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    date: { type: String, required: true }, // 'YYYY-MM-DD' (denormalised)
    content: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ["note", "idea", "task", "gratitude"],
      default: "note",
    },
    pinned: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Day timeline: notes for a user/day ordered by creation.
QuickNoteSchema.index({ userId: 1, date: 1, createdAt: 1 });

export default mongoose.models.QuickNote ||
  mongoose.model("QuickNote", QuickNoteSchema);
