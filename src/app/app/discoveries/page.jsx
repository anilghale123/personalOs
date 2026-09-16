import { DiscoveriesArchive } from "@/features/patterns/components/discoveries-archive";

/**
 * The discovery archive — every pattern ever found, held or faded.
 * Nothing is deleted here because nothing is ever deleted anywhere.
 *
 * Nothing is fetched here either: the screen reads its own copy, so the
 * route stays prerenderable and is prefetched whole.
 */
export default function DiscoveriesArchivePage() {
  return <DiscoveriesArchive />;
}
