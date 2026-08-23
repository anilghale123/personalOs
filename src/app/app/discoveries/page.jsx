import { getInsightArchive } from "@/features/patterns/actions";
import { DiscoveriesArchive } from "@/features/patterns/components/discoveries-archive";

export const dynamic = "force-dynamic";

/**
 * The discovery archive — every pattern ever found, held or faded.
 * Nothing is deleted here because nothing is ever deleted anywhere.
 */
export default async function DiscoveriesArchivePage() {
  const insights = await getInsightArchive();
  return <DiscoveriesArchive initial={insights} />;
}
