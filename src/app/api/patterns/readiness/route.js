import { withRoute, json } from "@/lib/api";
import { toDateKey } from "@/lib/utils";
import { cachedReference, tags } from "@/lib/cache";
import { computeCoverage, getDailySignals } from "@/features/patterns/signals";
import {
  DEFAULT_WINDOW_DAYS,
  MIN_ACTIVE_DAYS,
  READINESS_DOMAINS,
} from "@/features/patterns/constants";
import { addDays } from "@/features/patterns/dates";

/** The two lookback windows the readiness panel reports on. */
const WINDOWS = [30, DEFAULT_WINDOW_DAYS];

/**
 * GET /api/patterns/readiness — how much of the user's data the engine can
 * actually see, over the last 30 and 90 days.
 *
 * This is what the "still learning" state is built from. It reports the
 * shortfall per domain rather than a single ready/not-ready flag, because
 * "mood recorded on 11 of the last 30 days, most patterns need 24" tells
 * the user which capture habit unlocks which discovery — and a bare "not
 * enough data" tells them nothing.
 *
 * **Two windows, one query.** This used to call `getDailySignals` once per
 * window — six collection reads each, twelve per request, uncached, on every
 * Discoveries page load. The 30-day window is a strict *subset* of the
 * 90-day one, so it is sliced in memory instead. The whole result is then
 * cached per user per day, since coverage moves as the user captures data,
 * not by the second.
 */
export const GET = withRoute({ limit: "read" }, async ({ userId }) => {
  const to = toDateKey();

  const windows = await cachedReference(
    async () => {
      const longest = Math.max(...WINDOWS);
      const from = addDays(to, -(longest - 1));

      // The one and only fetch.
      const allSignals = await getDailySignals(userId, from, to);

      return WINDOWS.map((days) => {
        // `getDailySignals` returns a gap-explicit series — every day in the
        // range is present — so the last N entries are exactly the last N
        // days, with no risk of a sparse array shortening the window.
        const slice =
          days >= longest ? allSignals : allSignals.slice(-days);
        return windowReport(slice, days, to);
      });
    },
    {
      userId,
      key: "pattern-readiness",
      deps: [to],
      tags: [tags.signals(userId)],
      // A day: coverage counts whole days, so nothing can change within one
      // beyond the tag invalidations that a capture already triggers.
      seconds: 60 * 60,
    }
  );

  return json({
    generatedAt: new Date().toISOString(),
    to,
    windows,
    // The window a run actually uses, so the UI can headline one number.
    primary: windows.find((w) => w.days === DEFAULT_WINDOW_DAYS) ?? windows[0],
  });
});

/** Coverage for one lookback window, shaped for the readiness panel. */
function windowReport(signals, days, to) {
  const coverage = computeCoverage(signals);

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
    from: addDays(to, -(days - 1)),
    to,
    activeDays: coverage.activeDays,
    // Below this, no detector runs at all, whatever the per-domain counts.
    hasMinimumActivity: coverage.activeDays >= MIN_ACTIVE_DAYS,
    minActiveDays: MIN_ACTIVE_DAYS,
    domains,
    readyDomains: domains.filter((d) => d.ready).map((d) => d.id),
  };
}
