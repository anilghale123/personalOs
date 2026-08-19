import mongoose from "mongoose";

/**
 * One movement on a debt — either a repayment (reduces the balance) or
 * extra money borrowed on the same loan (increases it). Storing the
 * ledger instead of a running total means "how much have I paid" and
 * "how much is left" are both derivable and auditable.
 */
const DebtEntrySchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["payment", "borrow"],
      required: true,
    },
    amountPaisa: { type: Number, required: true }, // integer, always positive
    date: { type: String, required: true }, // 'YYYY-MM-DD' local calendar date
    note: { type: String, trim: true },
  },
  { timestamps: true }
);

const DebtSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    // "owe" — money you must pay back. "lent" — money owed to you.
    kind: { type: String, enum: ["owe", "lent"], default: "owe" },
    counterparty: { type: String, trim: true }, // lender / borrower
    principalPaisa: { type: Number, required: true }, // the original amount
    interestRate: { type: Number, default: 0 }, // annual %, display-only for now
    dueDate: { type: String }, // 'YYYY-MM-DD'
    note: { type: String, trim: true },
    entries: [DebtEntrySchema],
    status: { type: String, enum: ["active", "closed"], default: "active" },
  },
  { timestamps: true }
);

DebtSchema.index({ userId: 1, status: 1 });

export default mongoose.models.Debt || mongoose.model("Debt", DebtSchema);
