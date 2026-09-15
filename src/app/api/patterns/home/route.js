import { withRoute, json } from "@/lib/api";
import { getDiscoveriesData, getWeeklyBriefing } from "@/features/patterns/actions";

/**
 * GET /api/patterns/home — everything the Home screen shows, in one request.
 *
 * The screen paints its saved copy first and calls this in the background,
 * so arriving on Home never waits on these reads.
 */
export const GET = withRoute({ limit: "read", db: false }, async () => {
  // Both fetchers connect and resolve the session themselves.
  const [discoveries, briefing] = await Promise.all([
    getDiscoveriesData(),
    getWeeklyBriefing(),
  ]);
  return json({
    discoveries: discoveries ?? { insights: [], readiness: null, meta: null },
    briefing,
  });
});
