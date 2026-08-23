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
    /**
     * Structured signals extracted from `content`.
     *
     * Additive and optional — exactly like `title` and `aiSummary` before
     * it, old documents simply lack the field and no migration is needed.
     *
     * `sentiment` matters more than it looks: mood is optional and
     * nullable, and sparse mood coverage is the binding constraint on
     * most of the pattern engine. A sentiment derived from writing the
     * user was going to do anyway is an independent fallback signal for
     * days where no mood was ever set.
     */
    signals: {
      sentiment: { type: Number, min: -1, max: 1 },
      energy: { type: String, enum: ["low", "medium", "high"] },
      themes: [String],
      stressors: [String],
      extractedAt: Date,
      model: String,
    },
  },
  { timestamps: true, collection: "journalentries" }
);

// One journal per user per day.
DailyJournalSchema.index({ userId: 1, date: 1 }, { unique: true });
// Recent-entries queries.
DailyJournalSchema.index({ userId: 1, updatedAt: -1 });

export default mongoose.models.DailyJournal ||
  mongoose.model("DailyJournal", DailyJournalSchema);
