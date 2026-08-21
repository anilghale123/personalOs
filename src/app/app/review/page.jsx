import { CalendarCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { getWeeklyGoals } from "@/features/compass/actions";
import { getPlannerSummary } from "@/features/planner/actions";
import { ReviewClient } from "@/features/review/components/review-client";
import { PlannerReviewSummary } from "@/features/planner/components/planner-review-summary";
import { weekLabel } from "@/lib/week";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const [weeklyGoals, plannerSummary] = await Promise.all([
    getWeeklyGoals(),
    getPlannerSummary(),
  ]);

  return (
    <>
      <PageHeader
        icon={CalendarCheck}
        title="Weekly Review"
        subtitle={`Evaluate your week and get an AI briefing — ${weekLabel()}`}
      />
      <div className="space-y-6">
        <PlannerReviewSummary summary={plannerSummary} />
        <ReviewClient initialGoals={weeklyGoals} />
      </div>
    </>
  );
}
