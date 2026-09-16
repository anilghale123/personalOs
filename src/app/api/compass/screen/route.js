import { withRoute, json } from "@/lib/api";
import {
  getGoals,
  getAllHeatmapData,
  getWeeklyGoals,
} from "@/features/compass/actions";

/**
 * GET /api/compass/screen — everything Goals & Habits shows, in one request.
 *
 * A year of habit logs is the largest read in the app; `getAllHeatmapData`
 * caches it per user, and fetching it here rather than during the render
 * keeps the route itself prerenderable — which is what lets the tab be
 * prefetched and open without a skeleton.
 */
export const GET = withRoute({ limit: "read", db: false }, async () => {
  // Each fetcher connects and resolves the session itself.
  const [goals, { heatmap, habits }, weeklyGoals] = await Promise.all([
    getGoals(),
    getAllHeatmapData(),
    getWeeklyGoals(),
  ]);
  return json({ goals, heatmap, habits, weeklyGoals });
});
