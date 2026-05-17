import mongoose from "mongoose";

const StockPriceSchema = new mongoose.Schema(
  {
    ticker: { type: String, required: true, uppercase: true }, // 'CHCL', 'SAHAS', 'HIDCL'
    date: { type: Date, required: true },
    closePrice: { type: Number, required: true },
    openPrice: Number,
    highPrice: Number,
    lowPrice: Number,
    volume: Number,
    source: { type: String, default: "nepse-scraper" },
  },
  { timestamps: true }
);

StockPriceSchema.index({ ticker: 1, date: -1 }, { unique: true });

export default mongoose.models.StockPrice ||
  mongoose.model("StockPrice", StockPriceSchema);
