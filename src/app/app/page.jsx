import { auth } from "@/lib/auth";
import { getDiscoveriesData, getLifelineWeek, getWeeklyBriefing } from "@/features/patterns/actions";
import { DiscoveriesScreen } from "@/features/patterns/components/discoveries-screen";

export const dynamic = "force-dynamic";

/**
 * Home — the front door.
 *
 * Money and habits first, both cheap to produce. Pattern discovery only
 * ships what is already stored; running the engine is an explicit tap on
 * this screen, never a background side effect of arriving. The old
 * dashboard is intact at /app/today.
 */
export default async function DiscoveriesPage() {
  const session = await auth();
  const [data, lifeline, briefing] = await Promise.all([
    getDiscoveriesData(),
    getLifelineWeek(),
    getWeeklyBriefing(),
  ]);

  return (
    <DiscoveriesScreen
      initial={data ?? { insights: [], readiness: null, meta: null }}
      lifeline={lifeline}
      briefing={briefing}
      firstName={session?.user?.name?.split(" ")[0] || "there"}
    />
  );
}
