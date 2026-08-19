import mongoose from "mongoose";

/** A single deposit towards a savings goal. */
const ContributionSchema = new mongoose.Schema(
  {
    amountPaisa: { type: Number, required: true }, // integer, always positive
    date: { type: String, required: true }, // 'YYYY-MM-DD'
    note: { type: String, trim: true },
  },
  { timestamps: true }
);

/**
 * What the money is *for* — the thing you're saving towards. Distinct
 * from the compass {@link module:models/Goal}, which tracks life goals
 * and habits rather than money.
 */
const FinancialGoalSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    icon: { type: String, default: "🎯" },
    color: { type: String, default: "#16a34a" },
    targetPaisa: { type: Number, required: true },
    targetDate: { type: String }, // 'YYYY-MM-DD'
    note: { type: String, trim: true },
    contributions: [ContributionSchema],
    status: {
      type: String,
      enum: ["active", "achieved", "archived"],
      default: "active",
    },
  },
  { timestamps: true }
);

FinancialGoalSchema.index({ userId: 1, status: 1 });

export default mongoose.models.FinancialGoal ||
  mongoose.model("FinancialGoal", FinancialGoalSchema);
