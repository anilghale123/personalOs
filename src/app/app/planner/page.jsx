import { weekStartKey } from "@/lib/week";
import { getPlannerWeek } from "@/features/planner/actions";
import { PlannerScreen } from "@/features/planner/components/planner-screen";

export const dynamic = "force-dynamic";

export default async function PlannerPage() {
  const weekStart = weekStartKey();
  const goals = await getPlannerWeek(weekStart);

  // No PageHeader here: the title carries the live week range, so the
  // screen owns it (and the tabs that sit directly under it).
  return <PlannerScreen initialWeekStart={weekStart} initialGoals={goals} />;
}
