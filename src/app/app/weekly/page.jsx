import { CalendarCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { getWeeklyGoals } from "@/features/compass/actions";
import { getPlannerSummary } from "@/features/planner/actions";
import { PlannerReviewSummary } from "@/features/planner/components/planner-review-summary";
import { WeeklyClient } from "@/features/review/components/weekly-client";
import { weekLabel } from "@/lib/week";

export const dynamic = "force-dynamic";

/**
 * Weekly Discoveries — what the last seven days taught you, and whether
 * what you learned before still holds.
 *
 * The planner summary below is the existing component, unchanged.
 */
export default async function WeeklyPage() {
  const [weeklyGoals, plannerSummary] = await Promise.all([
    getWeeklyGoals(),
    getPlannerSummary(),
  ]);

  // The week's free-text reflection is stored on the first weekly goal —
  // reusing `WeeklyGoal.evaluation.reflection` rather than adding a field
  // for it, so anything already written is still there.
  const anchorGoal = weeklyGoals?.[0] ?? null;

  return (
    <>
      <PageHeader
        icon={CalendarCheck}
        title="Weekly Discoveries"
        subtitle={`What this week taught you — ${weekLabel()}`}
      />
      <div className="space-y-5">
        <WeeklyClient
          weekLabel={weekLabel()}
          goals={weeklyGoals}
          reflectionGoalId={anchorGoal?._id ?? null}
          initialReflection={anchorGoal?.evaluation?.reflection ?? ""}
        />
        <PlannerReviewSummary summary={plannerSummary} />
      </div>
    </>
  );
}
