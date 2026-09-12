import { Skeleton } from "@/components/ui/skeleton";

/** Planner fallback — a weekly grid of goal rows by day. */
export default function PlannerLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>

      <div className="overflow-hidden rounded-2xl bg-card elev-sm">
        {/* Day header strip */}
        <div className="flex gap-2 border-b px-4 py-2.5">
          <Skeleton className="h-3 w-28" />
          <div className="ml-auto flex gap-3">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-3 w-5" />
            ))}
          </div>
        </div>

        {/* Goal rows, tapering because the lower ones are usually off-screen */}
        {Array.from({ length: 4 }).map((_, row) => (
          <div
            key={row}
            className="flex items-center gap-2 border-b px-4 py-3 last:border-0"
            style={{ opacity: Math.max(1 - row * 0.18, 0.3) }}
          >
            <Skeleton className="h-4 w-36" />
            <div className="ml-auto flex gap-3">
              {Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-6 rounded-md" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
