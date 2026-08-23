import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { toDateKey } from "@/lib/utils";
import { computeCoverage, getDailySignals } from "@/features/patterns/signals";
import {
  DEFAULT_WINDOW_DAYS,
  MIN_ACTIVE_DAYS,
  READINESS_DOMAINS,
} from "@/features/patterns/constants";
import { addDays } from "@/features/patterns/dates";

/**
 * GET /api/patterns/readiness — how much of the user's data the engine can
 * actually see, over the last 30 and 90 days.
 *
 * This is what the "still learning" state is built from. It reports the
 * shortfall per domain rather than a single ready/not-ready flag, because
 * "mood recorded on 11 of the last 30 days, most patterns need 24" tells
 * the user which capture habit unlocks which discovery — and a bare "not
 * enough data" tells them nothing.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const to = toDateKey();

  try {
    const windows = await Promise.all(
      [30, DEFAULT_WINDOW_DAYS].map((days) => windowReport(session.user.id, days, to))
    );

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      to,
      windows,
      // The window a run actually uses, so the UI can headline one number.
      primary: windows.find((w) => w.days === DEFAULT_WINDOW_DAYS) ?? windows[0],
    });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Failed to read data coverage" },
      { status: 500 }
    );
  }
}

/** Coverage for one lookback window, shaped for the readiness panel. */
async function windowReport(userId, days, to) {
  const from = addDays(to, -(days - 1));
  const coverage = computeCoverage(await getDailySignals(userId, from, to));

  const domains = READINESS_DOMAINS.map((domain) => {
    const covered = coverage[domain.id] ?? 0;
    // A 30-day window cannot demand 90 days of anything.
    const target = Math.min(domain.target, days);
    return {
      id: domain.id,
      label: domain.label,
      unlocks: domain.unlocks,
      covered,
      target,
      shortfall: Math.max(target - covered, 0),
      rate: days > 0 ? covered / days : 0,
      ready: covered >= target,
    };
  });

  return {
    days,
    from,
    to,
    activeDays: coverage.activeDays,
    // Below this, no detector runs at all, whatever the per-domain counts.
    hasMinimumActivity: coverage.activeDays >= MIN_ACTIVE_DAYS,
    minActiveDays: MIN_ACTIVE_DAYS,
    domains,
    readyDomains: domains.filter((d) => d.ready).map((d) => d.id),
  };
}
