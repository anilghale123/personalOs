import { Skeleton, SkeletonParagraph } from "@/components/ui/skeleton";

/**
 * Fallback for the `/app` segment — the Home screen, and the default for any
 * dashboard route without a nearer `loading.jsx`.
 *
 * Shaped like Home specifically (greeting, money and habits briefings, then
 * the discovery panel) rather than as generic grey boxes. A placeholder that
 * matches the destination makes the arrival feel like the content resolving
 * rather than the layout being replaced.
 */
export default function DashboardLoading() {
  return (
    <div className="animate-fade-in" aria-busy="true" aria-label="Loading page">
      {/* Greeting */}
      <header className="mb-8 space-y-2.5">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-8 w-64 max-w-full" />
      </header>

      <div className="max-w-[860px] space-y-4">
        {/* Money and habits briefings */}
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="space-y-3 rounded-2xl bg-card elev-sm p-5"
            style={{ opacity: i === 0 ? 1 : 0.75 }}
          >
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-5 rounded-md" />
              <Skeleton className="h-4 w-28" />
            </div>
            <SkeletonParagraph lines={2} />
          </div>
        ))}

        {/* The collapsed pattern-discovery panel */}
        <div className="space-y-3 rounded-3xl border border-sand-300 bg-card px-5 py-5 opacity-60">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-3.5 w-full max-w-md" />
        </div>
      </div>
    </div>
  );
}
