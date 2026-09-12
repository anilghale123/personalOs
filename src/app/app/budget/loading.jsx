import {
  Skeleton,
  SkeletonTabs,
  SkeletonRows,
} from "@/components/ui/skeleton";

/**
 * Money section fallback.
 *
 * This segment previously had **no** loading boundary, so switching between
 * Expenses, Budget, Debts and Savings goals left the old screen frozen with no
 * feedback — on a serverless deploy that is seconds of a page that looks
 * broken. The nearest boundary above (`/app/loading.jsx`) does not cover a
 * change to a child of this layout, which is why it needed its own.
 */
export default function MoneyLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <SkeletonTabs count={3} />

      {/* The running-total bar, which is the first thing read on this screen */}
      <Skeleton className="h-12 w-full rounded-2xl" />

      <div className="flex items-center gap-2">
        <Skeleton className="h-9 flex-1 rounded-md sm:max-w-xs" />
        <Skeleton className="ml-auto h-9 w-32 rounded-md" />
      </div>

      <SkeletonRows rows={6} />
    </div>
  );
}
