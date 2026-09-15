import { weekStartKey } from "@/lib/week";
import { PlannerScreen } from "@/features/planner/components/planner-screen";

export const dynamic = "force-dynamic";

/**
 * Nothing is fetched here: the screen paints the week from its saved copy
 * and loads the server's in the background, so opening Planner never waits
 * on the database.
 */
export default function PlannerPage() {
  // No PageHeader here: the title carries the live week range, so the
  // screen owns it (and the tabs that sit directly under it).
  return <PlannerScreen initialWeekStart={weekStartKey()} />;
}
