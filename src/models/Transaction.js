import mongoose from "mongoose";

const TransactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    ticker: { type: String, required: true, uppercase: true },
    type: { type: String, enum: ["BUY", "SELL"], required: true },
    quantity: { type: Number, required: true },
    pricePerUnit: { type: Number, required: true },
    totalAmount: Number, // pricePerUnit * quantity (auto-computed)
    brokerCommission: Number,
    transactionDate: { type: Date, required: true },
    broker: { type: String, default: "Midas" }, // e.g., 'Midas Stock Broking'
    csvRowRef: String, // Original CSV row hash for deduplication on re-import
    notes: String,
  },
  { timestamps: true }
);

TransactionSchema.pre("save", function () {
  this.totalAmount = this.pricePerUnit * this.quantity;
});

// Prevent duplicate CSV imports
TransactionSchema.index(
  { userId: 1, csvRowRef: 1 },
  { unique: true, sparse: true }
);

// The activity feed sorts by date; without this the sort happened in memory
// over every transaction the user has ever recorded.
TransactionSchema.index({ userId: 1, transactionDate: -1 });
// Portfolio aggregation groups a user's rows by ticker.
TransactionSchema.index({ userId: 1, ticker: 1 });

export default mongoose.models.Transaction ||
  mongoose.model("Transaction", TransactionSchema);
