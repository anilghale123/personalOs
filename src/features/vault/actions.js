"use server";

import Papa from "papaparse";
import crypto from "crypto";
import mongoose from "mongoose";
import connectDB from "@/lib/mongoose";
import Transaction from "@/models/Transaction";
import StockPrice from "@/models/StockPrice";
import SIP from "@/models/SIP";
import { getSession } from "@/lib/session";
import { plain } from "@/lib/serialize";

/** Largest broker CSV we will accept. Midas exports are a few hundred KB. */
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
/** Row ceiling, independent of byte size. */
const MAX_IMPORT_ROWS = 20_000;
/** Writes per bulkWrite call — keeps any single request bounded. */
const BULK_BATCH = 500;


/**
 * Parses a Midas broker CSV and upserts transactions.
 * Expected CSV columns (Midas format):
 * Date, Symbol, Transaction Type, Quantity, Rate, Amount, Commission
 * @param {FormData} formData
 */
export async function importBrokerCSV(formData) {
  const session = await getSession();
  if (!session?.user?.id) {
    return { imported: 0, skipped: 0, errors: ["Unauthorized"] };
  }

  const file = formData.get("file");
  if (!file || typeof file.text !== "function") {
    return { imported: 0, skipped: 0, errors: ["No file provided"] };
  }

  // Caps first, before anything is read into memory. Without them the whole
  // file was buffered and then processed with two awaits per row, so a
  // 10,000-row CSV meant 20,000 sequential round-trips in one request —
  // comfortably past the function timeout.
  if (typeof file.size === "number" && file.size > MAX_IMPORT_BYTES) {
    return {
      imported: 0,
      skipped: 0,
      errors: [
        `That file is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is ${
          MAX_IMPORT_BYTES / 1024 / 1024
        }MB — split it and import in parts.`,
      ],
    };
  }

  const text = await file.text();
  const { data, errors: parseErrors } = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
  });

  if (!Array.isArray(data) || data.length === 0) {
    return {
      imported: 0,
      skipped: 0,
      errors: [
        parseErrors?.[0]?.message
          ? `Could not read that CSV: ${parseErrors[0].message}`
          : "That file had no rows we could read.",
      ],
    };
  }

  if (data.length > MAX_IMPORT_ROWS) {
    return {
      imported: 0,
      skipped: 0,
      errors: [
        `That file has ${data.length.toLocaleString()} rows. The limit is ${MAX_IMPORT_ROWS.toLocaleString()} per import.`,
      ],
    };
  }

  await connectDB();

  const errors = [];
  const operations = [];
  const seenHashes = new Set();
  let skipped = 0;

  for (const row of data) {
    const ticker = row["Symbol"]?.trim().toUpperCase();
    const quantity = Number.parseFloat(row["Quantity"]);
    const rate = Number.parseFloat(row["Rate"]);
    const date = new Date(row["Date"]);

    // Reject rather than store: a NaN quantity or an Invalid Date silently
    // corrupts every portfolio total derived from it.
    if (
      !ticker ||
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      !Number.isFinite(rate) ||
      rate <= 0 ||
      Number.isNaN(date.getTime())
    ) {
      skipped++;
      continue;
    }

    const rowHash = crypto
      .createHash("md5")
      .update(JSON.stringify(row))
      .digest("hex");

    // A CSV that repeats a row within itself would otherwise produce two
    // ops on the same key in one bulkWrite.
    if (seenHashes.has(rowHash)) {
      skipped++;
      continue;
    }
    seenHashes.add(rowHash);

    const commission = Number.parseFloat(row["Commission"] || "0");

    operations.push({
      updateOne: {
        filter: { userId: session.user.id, csvRowRef: rowHash },
        update: {
          $setOnInsert: {
            userId: session.user.id,
            ticker,
            type: row["Transaction Type"]?.toUpperCase().includes("BUY")
              ? "BUY"
              : "SELL",
            quantity,
            pricePerUnit: rate,
            totalAmount: rate * quantity,
            brokerCommission: Number.isFinite(commission) ? commission : 0,
            transactionDate: date,
            broker: "Midas",
            csvRowRef: rowHash,
          },
        },
        upsert: true,
      },
    });
  }

  let imported = 0;

  if (operations.length) {
    /**
     * One round trip in batches, `ordered: false` so a duplicate does not
     * abort the rest. Re-importing the same file is the normal case, and the
     * unique {userId, csvRowRef} index makes it a no-op — `upsertedCount`
     * counts only genuinely new rows.
     *
     * `$setOnInsert` rather than `$set` so a re-import never overwrites a
     * row the user has since edited by hand.
     */
    for (let i = 0; i < operations.length; i += BULK_BATCH) {
      const batch = operations.slice(i, i + BULK_BATCH);
      try {
        const result = await Transaction.bulkWrite(batch, { ordered: false });
        imported += result.upsertedCount ?? 0;
        skipped += batch.length - (result.upsertedCount ?? 0);
      } catch (err) {
        // A partial failure still reports what landed. Duplicate-key errors
        // are expected on re-import and are not surfaced as errors.
        const upserted = err.result?.upsertedCount ?? 0;
        imported += upserted;
        skipped += batch.length - upserted;
        const realErrors = (err.writeErrors ?? []).filter((e) => e.code !== 11000);
        if (realErrors.length) {
          errors.push(
            `${realErrors.length} row${realErrors.length === 1 ? "" : "s"} could not be imported.`
          );
        }
      }
    }
  }

  return { imported, skipped, errors };
}

/**
 * Computes portfolio summary: total invested, current value, P&L per ticker.
 * Always scoped to the signed-in user — this file is "use server", so every
 * export is client-callable and must never take a user id from the caller.
 */
export async function getPortfolioSummary() {
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) return [];
  await connectDB();

  /**
   * One pass, grouped in Mongo.
   *
   * This replaced a `tickers.map()` whose body ran three `.filter()` passes
   * over the full transaction array — O(transactions × tickers), so 2,000
   * rows across 40 tickers meant 240,000 comparisons and the whole history
   * crossing the wire to render one card grid. Mongo groups it on an index
   * and returns one document per holding instead.
   */
  const holdings = await Transaction.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: "$ticker",
        // Signed unit total: buys add, sells subtract.
        totalUnits: {
          $sum: {
            $cond: [{ $eq: ["$type", "BUY"] }, "$quantity", { $multiply: ["$quantity", -1] }],
          },
        },
        // Cost basis counts purchases only, commission included.
        totalInvested: {
          $sum: {
            $cond: [
              { $eq: ["$type", "BUY"] },
              {
                $add: [
                  { $ifNull: ["$totalAmount", 0] },
                  { $ifNull: ["$brokerCommission", 0] },
                ],
              },
              0,
            ],
          },
        },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  if (!holdings.length) return [];

  const latestPrices = await StockPrice.aggregate([
    { $match: { ticker: { $in: holdings.map((h) => h._id) } } },
    { $sort: { date: -1 } },
    { $group: { _id: "$ticker", closePrice: { $first: "$closePrice" } } },
  ]);
  const priceMap = new Map(latestPrices.map((p) => [p._id, p.closePrice]));

  return holdings.map((h) => {
    const totalUnits = h.totalUnits || 0;
    const totalInvested = h.totalInvested || 0;
    const lastPrice = priceMap.get(h._id) || 0;
    const currentValue = totalUnits * lastPrice;
    return {
      ticker: h._id,
      totalUnits,
      totalInvested,
      currentValue,
      lastPrice,
      pnl: currentValue - totalInvested,
      pnlPercent:
        totalInvested > 0
          ? ((currentValue - totalInvested) / totalInvested) * 100
          : 0,
      // Distinguishes "worth nothing" from "we have no price" — the two
      // looked identical before and both rendered as a 100% loss.
      hasPrice: priceMap.has(h._id),
    };
  });
}

/** Recent transactions for the activity feed. */
export async function getRecentTransactions(limit = 25) {
  const session = await getSession();
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
  const session = await getSession();
  if (!session?.user?.id) return [];
  await connectDB();
  const sips = await SIP.find({ userId: session.user.id })
    .sort({ createdAt: -1 })
    .lean();
  return plain(sips);
}
