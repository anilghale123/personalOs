import { CalendarCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { getWeeklyGoals } from "@/features/compass/actions";
import { ReviewClient } from "@/features/review/components/review-client";
import { weekLabel } from "@/lib/week";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const weeklyGoals = await getWeeklyGoals();

  return (
    <>
      <PageHeader
        icon={CalendarCheck}
        title="Weekly Review"
        subtitle={`Evaluate your week and get an AI briefing — ${weekLabel()}`}
      />
      <ReviewClient initialGoals={weeklyGoals} />
    </>
  );
}
