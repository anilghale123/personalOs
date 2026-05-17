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
    monthlyAmount: { type: Number, required: true }, // e.g., 1000 (NPR)
    currency: { type: String, default: "NPR" },
    startDate: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
    // Track each installment
    installments: [
      {
        date: Date,
        amountInvested: Number,
        navAtPurchase: Number, // Net Asset Value per unit
        unitsPurchased: Number,
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.models.SIP || mongoose.model("SIP", SIPSchema);
