import { Skeleton } from "@/components/ui/skeleton";

export default function ChallengesLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-2xl bg-card elev-sm p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-11 w-11 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-2 w-full" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
