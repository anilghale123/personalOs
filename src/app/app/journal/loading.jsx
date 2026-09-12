import { Skeleton, SkeletonParagraph } from "@/components/ui/skeleton";

/** Journal fallback — a wide writing pane beside the day calendar. */
export default function JournalLoading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          {/* Mood row */}
          <div className="flex gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-10 rounded-full" />
            ))}
          </div>
          {/* The entry itself */}
          <div className="space-y-3 rounded-2xl bg-card elev-sm p-5">
            <Skeleton className="h-5 w-40" />
            <SkeletonParagraph lines={5} />
          </div>
          <Skeleton className="h-11 w-full rounded-xl" />
        </div>

        {/* Calendar sidebar, desktop only — matching the real layout */}
        <div className="hidden space-y-3 lg:block">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-56 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
