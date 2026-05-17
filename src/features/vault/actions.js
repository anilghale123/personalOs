"use server";

import Papa from "papaparse";
import crypto from "crypto";
import connectDB from "@/lib/mongoose";
import Transaction from "@/models/Transaction";
import StockPrice from "@/models/StockPrice";
import SIP from "@/models/SIP";
import { auth } from "@/lib/auth";

function plain(doc) {
  return JSON.parse(JSON.stringify(doc));
}

/**
 * Parses a Midas broker CSV and upserts transactions.
 * Expected CSV columns (Midas format):
 * Date, Symbol, Transaction Type, Quantity, Rate, Amount, Commission
 * @param {FormData} formData
 */
export async function importBrokerCSV(formData) {
  const session = await auth();
  if (!session?.user?.id) {
    return { imported: 0, skipped: 0, errors: ["Unauthorized"] };
  }
  const file = formData.get("file");
  if (!file || typeof file.text !== "function") {
    return { imported: 0, skipped: 0, errors: ["No file provided"] };
  }
  const text = await file.text();
  const { data } = Papa.parse(text, { header: true, skipEmptyLines: true });

  await connectDB();
  let imported = 0;
  let skipped = 0;
  const errors = [];

  for (const row of data) {
    try {
      const rowHash = crypto
        .createHash("md5")
        .update(JSON.stringify(row))
        .digest("hex");

      const ticker = row["Symbol"]?.trim().toUpperCase();
      const quantity = parseFloat(row["Quantity"]);
      const rate = parseFloat(row["Rate"]);
      if (!ticker || Number.isNaN(quantity) || Number.isNaN(rate)) {
        skipped++;
        continue;
      }

      const existing = await Transaction.findOne({
        userId: session.user.id,
        csvRowRef: rowHash,
      });
      if (existing) {
        skipped++;
        continue;
      }

      await Transaction.create({
        userId: session.user.id,
        ticker,
        type: row["Transaction Type"]?.toUpperCase().includes("BUY")
          ? "BUY"
          : "SELL",
        quantity,
        pricePerUnit: rate,
        brokerCommission: parseFloat(row["Commission"] || "0") || 0,
        transactionDate: new Date(row["Date"]),
        broker: "Midas",
        csvRowRef: rowHash,
      });
      imported++;
    } catch (err) {
      if (err.code === 11000) skipped++;
      else errors.push(`Row error: ${err.message}`);
    }
  }

  return { imported, skipped, errors };
}

/**
 * Computes portfolio summary: total invested, current value, P&L per ticker.
 * @param {string} [userIdArg]
 */
export async function getPortfolioSummary(userIdArg) {
  const session = await auth();
  const userId = userIdArg || session?.user?.id;
  if (!userId) return [];
  await connectDB();

  const transactions = await Transaction.find({ userId }).lean();
  if (!transactions.length) return [];
  const tickers = [...new Set(transactions.map((t) => t.ticker))];

  const latestPrices = await StockPrice.aggregate([
    { $match: { ticker: { $in: tickers } } },
    { $sort: { date: -1 } },
    { $group: { _id: "$ticker", closePrice: { $first: "$closePrice" } } },
  ]);
  const priceMap = Object.fromEntries(
    latestPrices.map((p) => [p._id, p.closePrice])
  );

  return tickers.map((ticker) => {
    const txns = transactions.filter((t) => t.ticker === ticker);
    const totalUnits = txns.reduce(
      (sum, t) => sum + (t.type === "BUY" ? t.quantity : -t.quantity),
      0
    );
    const totalInvested = txns
      .filter((t) => t.type === "BUY")
      .reduce(
        (sum, t) => sum + (t.totalAmount || 0) + (t.brokerCommission || 0),
        0
      );
    const lastPrice = priceMap[ticker] || 0;
    const currentValue = totalUnits * lastPrice;
    return {
      ticker,
      totalUnits,
      totalInvested,
      currentValue,
      lastPrice,
      pnl: currentValue - totalInvested,
      pnlPercent:
        totalInvested > 0
          ? ((currentValue - totalInvested) / totalInvested) * 100
          : 0,
    };
  });
}

/** Recent transactions for the activity feed. */
export async function getRecentTransactions(limit = 25) {
  const session = await auth();
  if (!session?.user?.id) return [];
  await connectDB();
  const txns = await Transaction.find({ userId: session.user.id })
    .sort({ transactionDate: -1 })
    .limit(limit)
    .lean();
  return plain(txns);
}

/** All SIPs for the current user. */
export async function getSIPs() {
  const session = await auth();
  if (!session?.user?.id) return [];
  await connectDB();
  const sips = await SIP.find({ userId: session.user.id })
    .sort({ createdAt: -1 })
    .lean();
  return plain(sips);
}
