import mongoose from "mongoose";

/**
 * A total or per-category budget for one period. `carryForward` controls
 * whether {@link module:features/budget/actions.getOrCreateBudgets} will
 * clone this amount into the next period automatically. Introduced in
 * Phase 1 for the schema/index; used starting Phase 2.
 */
const BudgetSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    period: { type: String, enum: ["weekly", "monthly"], required: true },
    periodStart: { type: String, required: true }, // 'YYYY-MM-DD' — Monday for weekly, 1st for monthly
    scope: { type: String, enum: ["total", "category"], required: true },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },
    amountPaisa: { type: Number, required: true },
    carryForward: { type: Boolean, default: true },
  },
  { timestamps: true }
);

BudgetSchema.index(
  { userId: 1, period: 1, periodStart: 1, scope: 1, categoryId: 1 },
  { unique: true }
);

export default mongoose.models.Budget ||
  mongoose.model("Budget", BudgetSchema);
