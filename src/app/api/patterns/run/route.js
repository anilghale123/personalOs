import { withRoute, json, tooMany, ApiError } from "@/lib/api";
import { z } from "@/lib/validation";
import { invalidate, tags } from "@/lib/cache";
import { captureException } from "@/lib/logger";
import PatternRun from "@/models/PatternRun";
import { runPatternEngine } from "@/features/patterns/engine";
import { gateRun } from "@/features/patterns/persist";
import { RUN_TTL_HOURS } from "@/features/patterns/constants";

/**
 * POST /api/patterns/run
 *
 * Run the pattern engine and persist what it finds. Gated three ways now.
 *
 * The two original gates remain and are the important ones: inside the TTL
 * window an unforced call just reports when the next run is due — runs are
 * expensive and rediscovering the same patterns hourly helps nobody — and
 * forced ("check for new patterns") calls are capped per day.
 *
 * The third is the shared rate limiter, which is a backstop rather than the
 * real control. A run is the most CPU-expensive thing in the app: forty to
 * sixty hypotheses at four thousand permutations each, all synchronous, so it
 * holds a serverless instance for its whole duration. The per-day cap is what
 * keeps that bounded; the limiter only stops someone hammering the endpoint
 * to burn connections while being refused.
 *
 * Body: { force?: boolean }
 */
export const POST = withRoute(
  {
    limit: "write",
    body: z.object({ force: z.boolean().optional() }).catch({}),
  },
  async ({ userId, input }) => {
    const force = Boolean(input?.force);

    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);

    const [lastRun, manualRunsToday] = await Promise.all([
      PatternRun.findOne({ userId, error: null }).sort({ runAt: -1 }).lean(),
      PatternRun.countDocuments({
        userId,
        manual: true,
        runAt: { $gte: dayStart },
      }),
    ]);

    const gate = gateRun({
      lastRunAt: lastRun?.runAt,
      manualRunsToday,
      force,
    });

    if (!gate.allowed) {
      // Fresh results are a normal state and not an error; the daily manual
      // cap is a refusal and gets a 429 so the client can say so plainly.
      if (gate.reason === "rate_limited") {
        throw tooMany(
          "You've checked a few times today — results refresh again tomorrow."
        );
      }
      return json({
        ran: false,
        reason: gate.reason,
        lastRunAt: lastRun?.runAt ?? null,
        ...(gate.nextEligibleAt ? { nextEligibleAt: gate.nextEligibleAt } : {}),
      });
    }

    try {
      const result = await runPatternEngine(userId, {
        persist: true,
        manual: force,
      });

      // The feed reads stored insights, which this run has just rewritten.
      invalidate(tags.insights(userId));

      return json({
        ran: true,
        patterns: result.patterns,
        skipped: result.skipped,
        runMeta: result.runMeta,
        persistence: result.persistence,
        ttlHours: RUN_TTL_HOURS,
      });
    } catch (err) {
      // The engine records its own failed run for the audit log; this just
      // makes sure the error itself is reportable and the client gets a
      // message rather than a stack trace.
      captureException(err, { operation: "pattern-run", userId });
      throw new ApiError(
        500,
        "That check could not finish. Your existing discoveries are unchanged.",
        "pattern_run_failed"
      );
    }
  }
);
