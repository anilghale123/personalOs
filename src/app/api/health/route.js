import { NextResponse } from "next/server";
import mongoose from "mongoose";
import connectDB from "@/lib/mongoose";
import { canSendEmail } from "@/lib/mailer";
import { hasSharedLimiter } from "@/lib/rate-limit";

/** Never cached — a cached health check reports the past. */
export const dynamic = "force-dynamic";

/**
 * GET /api/health — for an uptime monitor.
 *
 * Deliberately unauthenticated, because a monitor cannot hold a session, and
 * deliberately uninformative about internals: it reports whether each
 * dependency is *configured and reachable*, never a hostname, version or
 * connection string. An attacker learns nothing they could not learn by
 * watching the app fail.
 *
 * A failing database is a 503, not a 200 with a sad field — monitors alert
 * on status codes.
 */
export async function GET() {
  const startedAt = Date.now();
  const checks = {};

  // The only check that gates the status code: without Mongo nothing works.
  try {
    await connectDB();
    // `ping` proves the socket is alive, not merely that mongoose thinks it
    // is — a dropped connection can leave readyState at 1 for a while.
    await mongoose.connection.db.admin().ping();
    checks.database = { ok: true, state: "connected" };
  } catch (err) {
    checks.database = {
      ok: false,
      // Class of failure only. The message can carry credentials.
      state: err.name === "MongooseServerSelectionError" ? "unreachable" : "error",
    };
  }

  // Configuration, not reachability — calling a paid API on every health
  // check would be its own problem.
  checks.email = { ok: canSendEmail, configured: canSendEmail };
  checks.rateLimiter = {
    ok: true,
    shared: hasSharedLimiter,
    // Flagged rather than failed: the app works, but limits are bypassable.
    degraded: !hasSharedLimiter,
  };
  checks.ai = { ok: true, configured: Boolean(process.env.GROQ_API_KEY) };

  const healthy = checks.database.ok;

  return NextResponse.json(
    {
      status: healthy ? "ok" : "unhealthy",
      at: new Date().toISOString(),
      ms: Date.now() - startedAt,
      checks,
    },
    {
      status: healthy ? 200 : 503,
      headers: { "Cache-Control": "no-store, max-age=0" },
    }
  );
}
