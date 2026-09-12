import { Skeleton, SkeletonRows, SkeletonTiles } from "@/components/ui/skeleton";

/** Portfolio fallback — totals, the allocation donut, then holdings. */
export default function PortfolioLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <SkeletonTiles count={3} />

      <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
        <SkeletonRows rows={4} />
        {/* The donut is dynamically imported, so reserve its height to stop
            the legend below it jumping when the chart arrives. */}
        <div className="space-y-3 rounded-2xl bg-card elev-sm p-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mx-auto h-40 w-40 rounded-full" />
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-3.5 w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
