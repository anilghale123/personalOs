import mongoose from "mongoose";

/**
 * One log entry for a single tracker on a single day.
 *
 * `target` is a **snapshot** of the computed ramp target at the moment the
 * day was saved. If a goal is changed later, past days still show the target
 * the user was actually chasing then — which is what makes "did I hit it"
 * meaningful after the fact.
 *
 * Rollup parents are never stored here: their values are always computed
 * from their children's entries.
 */
const EntrySchema = new mongoose.Schema(
  {
    trackerId: { type: mongoose.Schema.Types.ObjectId, required: true },
    // Direct value, or sum(sets) when the tracker uses sets.
    value: Number,
    // e.g. [10, 12, 10] — present when the tracker uses sets.
    sets: [Number],
    // For the "check" metric.
    done: Boolean,
    target: Number,
  },
  { _id: false }
);

/**
 * One document per challenge per day.
 *
 * The unique index on (challengeId, date) is what makes the upsert in
 * `PUT /api/challenges/[id]/logs/[date]` safe under a double-tap: the
 * second write races into the unique index and is rejected, rather than
 * silently appending a second document for the same day.
 */
const ChallengeLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    challengeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Challenge",
      required: true,
    },
    // 'YYYY-MM-DD', the viewer's local date — built the same way as
    // weekStartKey() in lib/week.js.
    date: { type: String, required: true },
    // 1..totalDays, computed server-side from startDate. Stored so that a
    // later change to startDate never rewrites what a day *was*.
    dayNumber: { type: Number, required: true },
    entries: [EntrySchema],
    note: String,
  },
  { timestamps: true }
);

ChallengeLogSchema.index({ challengeId: 1, date: 1 }, { unique: true });
ChallengeLogSchema.index({ userId: 1, date: 1 });

export default mongoose.models.ChallengeLog ||
  mongoose.model("ChallengeLog", ChallengeLogSchema);
