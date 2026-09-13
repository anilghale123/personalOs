import { getSession } from "@/lib/session";
import { getDiscoveriesData, getWeeklyBriefing } from "@/features/patterns/actions";
import { DiscoveriesScreen } from "@/features/patterns/components/discoveries-screen";

export const dynamic = "force-dynamic";

/**
 * Home — the front door.
 *
 * Money and habits first, both cheap to produce. Pattern discovery only
 * ships what is already stored; running the engine is an explicit tap on
 * this screen, never a background side effect of arriving.
 */
export default async function DiscoveriesPage() {
  const session = await getSession();
  const [data, briefing] = await Promise.all([
    getDiscoveriesData(),
    getWeeklyBriefing(),
  ]);

  return (
    <DiscoveriesScreen
      initial={data ?? { insights: [], readiness: null, meta: null }}
      briefing={briefing}
      firstName={session?.user?.name?.split(" ")[0] || "there"}
    />
  );
}
