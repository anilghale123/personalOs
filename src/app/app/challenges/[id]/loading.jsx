import { Skeleton } from "@/components/ui/skeleton";

export default function ChallengeDetailLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-9 w-56" />
      <div className="flex gap-2">
        <Skeleton className="h-9 w-16 rounded-md" />
        <Skeleton className="h-9 w-24 rounded-md" />
      </div>
      <div className="rounded-2xl bg-card elev-sm p-5">
        <Skeleton className="h-6 w-40" />
        <div className="mt-3 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
