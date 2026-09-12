import mongoose from "mongoose";

const SIPSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    fundName: { type: String, required: true }, // e.g., 'NMB Saral Bachat Fund-E'
    ticker: String, // Optional NEPSE ticker if listed
    /**
     * Integer paisa, like every other amount in the app (see lib/money.js).
     *
     * `monthlyAmount` — a float in rupees — is retained only so documents
     * written before the migration still read; `monthlyAmountPaisa` is
     * authoritative. scripts/migrate-vault-to-paisa.mjs backfills it.
     */
    monthlyAmountPaisa: { type: Number },
    /** @deprecated float rupees — read only for unmigrated documents. */
    monthlyAmount: { type: Number },
    currency: { type: String, default: "NPR" },
    startDate: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
    // Track each installment
    installments: [
      {
        date: Date,
        /** Integer paisa. */
        amountInvestedPaisa: { type: Number },
        /** @deprecated float rupees. */
        amountInvested: Number,
        /**
         * NAV per unit, in paisa. A NAV is a price, not a user-entered
         * amount, but it multiplies into money so it gets the same integer
         * treatment rather than being the one float left in the chain.
         */
        navAtPurchasePaisa: { type: Number },
        /** @deprecated float rupees. */
        navAtPurchase: Number,
        /**
         * Units × 10⁴, as an integer.
         *
         * Units are genuinely fractional — `amountInvested / nav` rarely
         * divides evenly — so there is no representation that is both exact
         * and integral. Four decimal places is the convention Nepali mutual
         * funds quote to, and fixing the scale here means the rounding
         * happens exactly once, at the boundary, instead of drifting
         * through every later sum.
         */
        unitsScaled: { type: Number },
        /** @deprecated float units. */
        unitsPurchased: Number,
        /** Guards against the same installment being recorded twice. */
        idempotencyKey: { type: String },
      },
    ],
  },
  { timestamps: true }
);

// Every SIP read is "this user's SIPs, newest first". Without this the
// portfolio page ran a full collection scan on every load.
SIPSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.models.SIP || mongoose.model("SIP", SIPSchema);
