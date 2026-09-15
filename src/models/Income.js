import mongoose from "mongoose";
import { INCOME_CATEGORIES } from "../features/wealth/constants.js";

/**
 * Money in — salary, transfers received, refunds.
 *
 * Its own collection rather than a `type` flag on Expense, deliberately:
 * every budget total, breakdown, pattern detector and cached summary sums
 * the Expense collection, and a flag would have to be remembered in every
 * one of those queries or income would silently count as spending.
 */

const IncomeSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    amountPaisa: { type: Number, required: true }, // integer, never a float
    currency: { type: String, default: "NPR" },
    category: { type: String, enum: INCOME_CATEGORIES, default: "Other" },
    date: { type: String, required: true }, // 'YYYY-MM-DD' local date
    note: { type: String, trim: true, maxlength: 500 },
    /** manual | voice | import:<bank> */
    source: { type: String, trim: true, maxlength: 40, default: "manual" },
    /** Statement-import dedupe key; only imported rows carry one. */
    fingerprint: { type: String },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

IncomeSchema.index({ userId: 1, deletedAt: 1, date: -1 });
IncomeSchema.index(
  { userId: 1, fingerprint: 1 },
  { partialFilterExpression: { fingerprint: { $type: "string" } } }
);

export default mongoose.models.Income || mongoose.model("Income", IncomeSchema);
