import { Skeleton, SkeletonTiles } from "@/components/ui/skeleton";

/** Habits & Goals fallback — a heatmap above goal cards. */
export default function GoalsLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-7 w-48" />

      {/* Habit heatmap: a year of cells, so a single block reads better than
          hundreds of individually shimmering squares. */}
      <div className="space-y-2 rounded-2xl bg-card elev-sm p-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-28 w-full rounded-lg" />
      </div>

      <SkeletonTiles count={3} />
      <Skeleton className="h-48 w-full rounded-2xl" />
    </div>
  );
}
