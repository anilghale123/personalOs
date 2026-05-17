import { Compass } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { getGoals, getAllHeatmapData } from "@/features/compass/actions";
import { CompassClient } from "@/features/compass/components/compass-client";

export const dynamic = "force-dynamic";

export default async function CompassPage() {
  const [goals, { heatmap, habits }] = await Promise.all([
    getGoals(),
    getAllHeatmapData(),
  ]);

  return (
    <>
      <PageHeader
        icon={Compass}
        title="Compass"
        subtitle="Track goals, build habits and keep your streak alive."
      />
      <CompassClient
        initialGoals={goals}
        initialHeatmap={heatmap}
        initialHabits={habits}
      />
    </>
  );
}
