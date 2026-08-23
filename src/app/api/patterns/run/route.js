import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongoose";
import PatternRun from "@/models/PatternRun";
import { runPatternEngine } from "@/features/patterns/engine";
import { gateRun } from "@/features/patterns/persist";
import { RUN_TTL_HOURS } from "@/features/patterns/constants";

/**
 * POST /api/patterns/run
 *
 * Run the pattern engine and persist what it finds. Gated two ways
 * (§5.5): inside the TTL window an unforced call just reports when the
 * next run is due — runs are expensive and rediscovering the same
 * patterns hourly helps nobody — and forced ("check for new patterns")
 * calls are capped per day. The TTL is per-user, keyed off the last
 * successful run.
 *
 * Body: { force?: boolean }
 */
export async function POST(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let force = false;
  try {
    const body = await request.json();
    force = Boolean(body?.force);
  } catch {
    // An empty body is a plain unforced run.
  }

  await connectDB();
  const userId = session.user.id;
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  const [lastRun, manualRunsToday] = await Promise.all([
    PatternRun.findOne({ userId, error: null }).sort({ runAt: -1 }).lean(),
    PatternRun.countDocuments({ userId, manual: true, runAt: { $gte: dayStart } }),
  ]);

  const gate = gateRun({ lastRunAt: lastRun?.runAt, manualRunsToday, force });
  if (!gate.allowed) {
    return NextResponse.json(
      {
        ran: false,
        reason: gate.reason,
        lastRunAt: lastRun?.runAt ?? null,
        ...(gate.nextEligibleAt ? { nextEligibleAt: gate.nextEligibleAt } : {}),
      },
      // Fresh results are a normal state; the daily manual cap is not.
      { status: gate.reason === "rate_limited" ? 429 : 200 }
    );
  }

  try {
    const result = await runPatternEngine(userId, { persist: true, manual: force });
    return NextResponse.json({
      ran: true,
      patterns: result.patterns,
      skipped: result.skipped,
      runMeta: result.runMeta,
      persistence: result.persistence,
      ttlHours: RUN_TTL_HOURS,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Pattern run failed" },
      { status: 500 }
    );
  }
}
