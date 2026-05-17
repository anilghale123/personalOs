import mongoose from "mongoose";

const JournalEntrySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    date: { type: String, required: true }, // 'YYYY-MM-DD' — one entry per day
    content: { type: String, default: "" }, // Rich text or Markdown
    mood: {
      type: String,
      enum: ["amazing", "good", "okay", "bad", "awful"],
    },
    tags: [String], // e.g., ['productive', 'stressed']
    wordCount: Number,
    isSynced: { type: Boolean, default: true },
  },
  { timestamps: true }
);

JournalEntrySchema.index({ userId: 1, date: 1 }, { unique: true });

export default mongoose.models.JournalEntry ||
  mongoose.model("JournalEntry", JournalEntrySchema);
