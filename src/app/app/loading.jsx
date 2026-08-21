import { Skeleton } from "@/components/ui/skeleton";

/**
 * Navigation fallback for every dashboard page. Next.js renders this
 * instantly when a route is clicked, while the destination page's
 * server data loads — so switching pages always gives visible feedback.
 */
export default function DashboardLoading() {
  return (
    <div className="animate-fade-in" aria-busy="true" aria-label="Loading page">
      {/* Page header placeholder */}
      <div className="mb-8 flex items-start gap-3">
        <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
        <div className="space-y-2 pt-1">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
      </div>

      {/* Content placeholder */}
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </div>
  );
}
