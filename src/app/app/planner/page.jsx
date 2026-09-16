import { PlannerScreen } from "@/features/planner/components/planner-screen";

/**
 * Nothing is fetched here: the screen paints the week from its saved copy
 * and loads the server's in the background, so opening Planner never waits
 * on the database.
 *
 * Which week that is comes from the browser, not from here. This route is
 * prerendered so it can be prefetched whole, and a week resolved during
 * render would be the week the deploy happened — besides which "now" on a
 * Vercel server is UTC, and the planner is a local-time grid.
 */
export default function PlannerPage() {
  // No PageHeader here: the title carries the live week range, so the
  // screen owns it (and the tabs that sit directly under it).
  return <PlannerScreen />;
}
