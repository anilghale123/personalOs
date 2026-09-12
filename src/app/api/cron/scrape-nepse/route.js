import { NextResponse } from "next/server";
import connectDB from "@/lib/mongoose";
import { log } from "@/lib/logger";
import StockPrice from "@/models/StockPrice";

const TICKERS = ["CHCL", "SAHAS", "HIDCL"];

/**
 * How long to wait on NEPSE's feed.
 *
 * This is an unofficial third-party endpoint with no uptime guarantee. Without
 * a timeout a hung socket stalled the whole cron run until the platform killed
 * the function, so a single slow response meant no prices updated at all.
 */
const FETCH_TIMEOUT_MS = 12_000;

/**
 * GET — Called on a schedule by Vercel Cron. Scrapes NEPSE's today's-price
 * feed and upserts close/open/high/low for the tracked tickers.
 *
 * Not wrapped in `withRoute`: this has no session and authenticates with a
 * bearer secret instead, so the shared wrapper's session check would be
 * exactly wrong here.
 */
export async function GET(request) {
  // Constant-time-ish comparison is overkill for a header check, but the
  // secret must be present and non-empty or every caller would pass.
  const authHeader = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected || authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();
  const businessDate = getTodayNPT();

  /**
   * One fetch, not one per ticker.
   *
   * The endpoint returns the whole day's price list, so fetching it inside the
   * ticker loop made three identical requests for the same payload — three
   * times the latency and three times the load on someone else's unofficial
   * API, for no additional data.
   */
  let content;
  try {
    content = await fetchTodaysPrices(businessDate);
  } catch (err) {
    log.error("NEPSE price fetch failed", {
      businessDate,
      reason: err.name === "AbortError" ? "timeout" : err.message,
    });
    return NextResponse.json(
      { scraped: [], error: "Price feed unavailable", at: new Date().toISOString() },
      { status: 502 }
    );
  }

  const bySymbol = new Map(
    (content ?? []).map((row) => [String(row.symbol).toUpperCase(), row])
  );

  const results = [];
  const operations = [];

  for (const ticker of TICKERS) {
    const row = bySymbol.get(ticker);
    if (!row) {
      results.push({ ticker, status: "no-data" });
      continue;
    }

    const closePrice = Number(row.closingPrice);
    // A non-finite close price would be stored and then multiplied into every
    // holding value that reads it.
    if (!Number.isFinite(closePrice) || closePrice <= 0) {
      results.push({ ticker, status: "invalid-price" });
      continue;
    }

    const numeric = (v) => (Number.isFinite(Number(v)) ? Number(v) : undefined);

    operations.push({
      updateOne: {
        filter: { ticker, date: new Date(businessDate) },
        update: {
          $set: {
            closePrice,
            openPrice: numeric(row.openPrice),
            highPrice: numeric(row.highPrice),
            lowPrice: numeric(row.lowPrice),
            volume: numeric(row.totalTradedQuantity),
            source: "nepse-scraper",
          },
        },
        upsert: true,
      },
    });
    results.push({ ticker, status: "ok", closePrice });
  }

  if (operations.length) {
    try {
      await StockPrice.bulkWrite(operations, { ordered: false });
    } catch (err) {
      log.error("NEPSE price upsert failed", { message: err.message });
      return NextResponse.json(
        { scraped: results, error: "Could not save prices", at: new Date().toISOString() },
        { status: 500 }
      );
    }
  }

  log.info("NEPSE prices updated", {
    businessDate,
    saved: operations.length,
    requested: TICKERS.length,
  });

  return NextResponse.json({ scraped: results, at: new Date().toISOString() });
}

/**
 * Fetch the day's price list, with a hard timeout.
 * @param {string} businessDate 'YYYY-MM-DD'
 */
async function fetchTodaysPrices(businessDate) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(
      `https://nepalstock.com.np/api/nots/nepse-data/todaysprice?&size=500&businessDate=${businessDate}`,
      {
        headers: { Accept: "application/json" },
        signal: controller.signal,
        cache: "no-store",
      }
    );
    if (!res.ok) throw new Error(`Price feed responded ${res.status}`);
    const data = await res.json();
    return data?.content ?? [];
  } finally {
    clearTimeout(timer);
  }
}

/** Nepal is UTC+5:45 — compute the correct local trading date. */
function getTodayNPT() {
  const now = new Date();
  const nptOffset = 5 * 60 + 45; // minutes
  const npt = new Date(now.getTime() + nptOffset * 60 * 1000);
  return npt.toISOString().split("T")[0];
}
