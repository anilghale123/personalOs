import { auth } from "@/lib/auth";
import { getDiscoveriesData, getLifelineWeek } from "@/features/patterns/actions";
import { DiscoveriesScreen } from "@/features/patterns/components/discoveries-screen";

export const dynamic = "force-dynamic";

/**
 * Discoveries — the front door.
 *
 * Renders only what is already stored, so the page paints without waiting
 * on a multi-collection scan. If that stored set is past its TTL, the
 * client kicks off a run in the background and the feed updates when it
 * lands. The old dashboard is intact at /app/today.
 */
export default async function DiscoveriesPage() {
  const session = await auth();
  const [data, lifeline] = await Promise.all([
    getDiscoveriesData(),
    getLifelineWeek(),
  ]);

  return (
    <DiscoveriesScreen
      initial={data ?? { insights: [], readiness: null, meta: null }}
      lifeline={lifeline}
      firstName={session?.user?.name?.split(" ")[0] || "there"}
    />
  );
}
