import mongoose from "mongoose";

/**
 * Insight — a validated, persisted pattern with evidence, history and
 * feedback.
 *
 * One document per (userId, fingerprint). The engine upserts by that
 * fingerprint on every run, so a rediscovered pattern *confirms* the
 * existing document — pushing to `strengthHistory` and incrementing
 * `timesConfirmed` — instead of duplicating it. Nothing here is ever
 * hard-deleted: dismissal is a status change, and a pattern that stops
 * being significant goes `stale` with its history intact. History is the
 * product.
 */
const InsightSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    detectorId: { type: String, required: true },
    // e.g. { habitName: 'Morning Run' } — Mixed because each detector
    // parameterises differently.
    params: { type: mongoose.Schema.Types.Mixed, default: {} },
    // sha1(detectorId + '|' + stableStringify(params)) — see fingerprint.js
    fingerprint: { type: String, required: true },

    // The statement is re-rendered from key + vars at read time, so a
    // template fix reaches old insights too.
    statementKey: { type: String, required: true },
    statementVars: { type: mongoose.Schema.Types.Mixed, default: {} },
    title: { type: String, required: true },
    domains: { type: [String], default: [] },
    family: { type: String, required: true },

    effect: {
      type: { type: String }, // 'group_difference' | 'correlation'
      value: Number,
      unit: String,
      standardised: Number,
    },
    direction: { type: String, enum: ["positive", "negative"] },
    n: Number,
    pValue: Number,
    qValue: Number,
    confidence: { type: String, enum: ["low", "moderate", "high"], default: "low" },

    // Capped per EVIDENCE_MAX_* — day references, never full source rows.
    evidence: { type: mongoose.Schema.Types.Mixed, default: {} },
    windowFrom: String,
    windowTo: String,

    // Filled by the narration route — never required to render. The
    // deterministic statement is always the load-bearing sentence, so
    // both of these being absent costs the user nothing.
    narration: {
      text: String,
      model: String,
      generatedAt: Date,
    },
    // "Why might this be?" — possibilities only, asked for on demand.
    explanation: {
      text: String,
      model: String,
      generatedAt: Date,
    },

    status: {
      type: String,
      enum: ["active", "stale", "dismissed", "archived"],
      default: "active",
    },
    firstDetectedAt: { type: Date, required: true },
    lastConfirmedAt: { type: Date, required: true },
    timesConfirmed: { type: Number, default: 1 },
    // One entry per confirming run — the "has this held?" chart.
    strengthHistory: {
      type: [
        {
          date: Date,
          value: Number, // standardised effect
          n: Number,
          qValue: Number,
          confidence: String,
          _id: false,
        },
      ],
      default: [],
    },

    // Sign flipped versus the previous run — held back until it settles.
    unstable: { type: Boolean, default: false },

    feedback: {
      rating: { type: String, enum: ["useful", "not_useful", "knew_it"] },
      note: String,
      at: Date,
    },
    // Hiding the same pattern twice says what "I already knew this" says,
    // just more quietly — after the second time the engine stops
    // surfacing it, while still testing it and keeping its history.
    dismissCount: { type: Number, default: 0 },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Identity: one document per user per pattern.
InsightSchema.index({ userId: 1, fingerprint: 1 }, { unique: true });
// The feed: active insights, most recently confirmed first.
InsightSchema.index({ userId: 1, status: 1, lastConfirmedAt: -1 });
InsightSchema.index({ userId: 1, confidence: 1 });

export default mongoose.models.Insight || mongoose.model("Insight", InsightSchema);
