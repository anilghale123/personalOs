import { Target } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import {
  getGoals,
  getAllHeatmapData,
  getWeeklyGoals,
} from "@/features/compass/actions";
import { CompassClient } from "@/features/compass/components/compass-client";
import { WeeklyGoals } from "@/features/compass/components/weekly-goals";
import { weekLabel } from "@/lib/week";

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const [goals, { heatmap, habits }, weeklyGoals] = await Promise.all([
    getGoals(),
    getAllHeatmapData(),
    getWeeklyGoals(),
  ]);

  return (
    <>
      <PageHeader
        icon={Target}
        title="Goals & Habits"
        subtitle="The week, your habits, the long game"
      />
      <div className="space-y-8">
        <WeeklyGoals initialGoals={weeklyGoals} weekLabel={weekLabel()} />
        <CompassClient
          initialGoals={goals}
          initialHeatmap={heatmap}
          initialHabits={habits}
        />
      </div>
    </>
  );
}
