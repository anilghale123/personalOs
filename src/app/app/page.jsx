import { DiscoveriesScreen } from "@/features/patterns/components/discoveries-screen";

export const dynamic = "force-dynamic";

/**
 * Home — the front door.
 *
 * Money and habits first, both cheap to produce. Pattern discovery only
 * ships what is already stored; running the engine is an explicit tap on
 * this screen, never a background side effect of arriving.
 *
 * Nothing is fetched here: the screen paints its saved copy and loads
 * /api/patterns/home in the background.
 */
export default function DiscoveriesPage() {
  return <DiscoveriesScreen />;
}
