import { notFound } from "next/navigation";
import { getGoalById } from "@/features/compass/actions";
import { GoalDetailClient } from "@/features/compass/components/goal-detail-client";

export const dynamic = "force-dynamic";

export default async function GoalPage({ params }) {
  const goal = await getGoalById(params.goalId);
  if (!goal) notFound();
  return <GoalDetailClient initialGoal={goal} />;
}
