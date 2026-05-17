import mongoose from "mongoose";

/**
 * DailyJournal — the structured emotional "spine" of a day.
 * One per user per day.
 *
 * Migration note: this model is intentionally bound to the existing
 * `journalentries` collection, so every legacy one-entry-per-day record
 * is instantly readable as a DailyJournal with zero data migration. The
 * new `title` / `aiSummary` fields are simply absent on old documents.
 */
const DailyJournalSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    date: { type: String, required: true }, // 'YYYY-MM-DD'
    mood: {
      type: String,
      enum: ["amazing", "good", "okay", "bad", "awful", null],
      default: null,
    },
    title: { type: String, default: "" },
    content: { type: String, default: "" }, // long-form reflection (Markdown)
    tags: [String],
    aiSummary: { type: String, default: "" }, // per-day AI reflection
  },
  { timestamps: true, collection: "journalentries" }
);

// One journal per user per day.
DailyJournalSchema.index({ userId: 1, date: 1 }, { unique: true });
// Recent-entries queries.
DailyJournalSchema.index({ userId: 1, updatedAt: -1 });

export default mongoose.models.DailyJournal ||
  mongoose.model("DailyJournal", DailyJournalSchema);
