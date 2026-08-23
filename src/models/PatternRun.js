import mongoose from "mongoose";

/**
 * PatternRun — the audit log of engine executions.
 *
 * Serves three jobs: the TTL gate (don't recompute inside RUN_TTL_HOURS),
 * the manual-run rate limit (`manual` flags a user-requested run), and
 * debugging why a pattern did or didn't fire on a given day.
 */
const PatternRunSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    runAt: { type: Date, default: Date.now },
    windowFrom: String,
    windowTo: String,
    detectorsRun: { type: Number, default: 0 },
    detectorsSkipped: { type: Number, default: 0 },
    hypotheses: { type: Number, default: 0 },
    patternsFound: { type: Number, default: 0 },
    patternsNew: { type: Number, default: 0 },
    durationMs: Number,
    // A user-triggered "check for new patterns" — rate-limited separately.
    manual: { type: Boolean, default: false },
    error: String,
  },
  { timestamps: true }
);

// The TTL gate asks only "what was the latest run for this user".
PatternRunSchema.index({ userId: 1, runAt: -1 });

export default mongoose.models.PatternRun || mongoose.model("PatternRun", PatternRunSchema);
