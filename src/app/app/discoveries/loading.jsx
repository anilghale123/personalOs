import { Skeleton, SkeletonParagraph } from "@/components/ui/skeleton";

/** Discoveries fallback — the insight feed. */
export default function DiscoveriesLoading() {
  return (
    <div className="max-w-[860px] space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-7 w-52" />

      {/* Headline insight, then quieter rows beneath it. */}
      <div className="space-y-3 rounded-3xl border border-sand-300 bg-card px-5 py-5">
        <Skeleton className="h-4 w-24 rounded-full" />
        <Skeleton className="h-6 w-3/4" />
        <SkeletonParagraph lines={2} />
      </div>

      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="flex items-start gap-3 rounded-2xl bg-card elev-sm p-4"
          style={{ opacity: Math.max(1 - i * 0.22, 0.35) }}
        >
          <Skeleton className="h-5 w-12 shrink-0 rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
