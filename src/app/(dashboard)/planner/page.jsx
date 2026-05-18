import { CalendarDays } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { weekStartKey } from "@/lib/week";
import { getPlannerWeek } from "@/features/planner/actions";
import { PlannerScreen } from "@/features/planner/components/planner-screen";

export const dynamic = "force-dynamic";

export default async function PlannerPage() {
  const weekStart = weekStartKey();
  const goals = await getPlannerWeek(weekStart);

  return (
    <>
      <PageHeader
        icon={CalendarDays}
        title="Weekly Planner"
        subtitle="Block out your week hour by hour — from the early morning to midnight."
      />
      <PlannerScreen initialWeekStart={weekStart} initialGoals={goals} />
    </>
  );
}
