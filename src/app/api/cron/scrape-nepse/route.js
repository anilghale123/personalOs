import { NextResponse } from "next/server";
import connectDB from "@/lib/mongoose";
import StockPrice from "@/models/StockPrice";

const TICKERS = ["CHCL", "SAHAS", "HIDCL"];

/**
 * GET — Called daily at 6PM NPT by Vercel Cron. Scrapes NEPSE today's
 * price feed and upserts close/open/high/low for the tracked tickers.
 */
export async function GET(request) {
  // Verify cron secret to prevent unauthorized calls
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();
  const results = [];
  const businessDate = getTodayNPT();

  for (const ticker of TICKERS) {
    try {
      // NEPSE's unofficial JSON endpoint (adjust URL/headers as needed)
      const res = await fetch(
        `https://nepalstock.com.np/api/nots/nepse-data/todaysprice?&size=500&businessDate=${businessDate}`,
        {
          headers: { Accept: "application/json" },
          next: { revalidate: 0 },
        }
      );
      const data = await res.json();
      const stockData = data?.content?.find((s) => s.symbol === ticker);

      if (stockData) {
        await StockPrice.findOneAndUpdate(
          { ticker, date: new Date(businessDate) },
          {
            closePrice: stockData.closingPrice,
            openPrice: stockData.openPrice,
            highPrice: stockData.highPrice,
            lowPrice: stockData.lowPrice,
            volume: stockData.totalTradedQuantity,
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        results.push({ ticker, status: "ok" });
      } else {
        results.push({ ticker, status: "no-data" });
      }
    } catch (err) {
      results.push({ ticker, status: "error", message: err.message });
    }
  }

  return NextResponse.json({
    scraped: results,
    at: new Date().toISOString(),
  });
}

/** Nepal is UTC+5:45 — compute the correct local trading date. */
function getTodayNPT() {
  const now = new Date();
  const nptOffset = 5 * 60 + 45; // minutes
  const npt = new Date(now.getTime() + nptOffset * 60 * 1000);
  return npt.toISOString().split("T")[0];
}
