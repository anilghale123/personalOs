import { cn } from "@/lib/utils";

/**
 * A loading placeholder.
 *
 * Uses a travelling shimmer rather than `animate-pulse`. Pulse fades the whole
 * block in and out together, which at low opacity reads as "nothing is here";
 * a sweep moves across the block, which reads as "something is coming". On a
 * slow connection that difference is the whole point of the component.
 *
 * `motion-reduce` falls back to a flat tint: a sweeping gradient is exactly
 * the kind of continuous motion `prefers-reduced-motion` exists to suppress.
 */
function Skeleton({ className, ...props }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative overflow-hidden rounded-md bg-muted",
        "before:absolute before:inset-0 before:-translate-x-full",
        "before:bg-gradient-to-r before:from-transparent before:via-foreground/[0.07] before:to-transparent",
        "before:animate-shimmer",
        "motion-reduce:before:hidden motion-reduce:animate-pulse",
        className
      )}
      {...props}
    />
  );
}

/** A line of text. `w` lets a paragraph have ragged, believable line lengths. */
function SkeletonText({ className, w = "100%" }) {
  return <Skeleton className={cn("h-4", className)} style={{ width: w }} />;
}

/**
 * A block of body copy.
 *
 * The last line is deliberately short — uniform full-width lines look like a
 * table, not a paragraph, and the eye notices.
 */
function SkeletonParagraph({ lines = 3, className }) {
  const widths = ["100%", "96%", "88%", "92%", "70%"];
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonText
          key={i}
          w={i === lines - 1 ? "62%" : widths[i % widths.length]}
        />
      ))}
    </div>
  );
}

/** The page title block every dashboard screen opens with. */
function SkeletonPageHeader({ withIcon = true }) {
  return (
    <div className="mb-8 flex items-start gap-3">
      {withIcon && <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />}
      <div className="space-y-2 pt-1">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
    </div>
  );
}

/** A row of summary tiles. */
function SkeletonTiles({ count = 3, className }) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full rounded-xl" />
      ))}
    </div>
  );
}

/**
 * A list of records, grouped under day headers.
 *
 * Rows taper in opacity down the list. The real list is scrollable and its
 * lower rows are usually below the fold, so a uniform block of placeholders
 * overstates how much is loading.
 */
function SkeletonRows({ rows = 5, className }) {
  return (
    <div className={cn("overflow-hidden rounded-2xl bg-card elev-sm", className)}>
      <div className="flex items-center justify-between bg-muted/40 px-4 py-2">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-3 w-16" />
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-4 py-3"
            style={{ opacity: Math.max(1 - i * 0.16, 0.25) }}
          >
            <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-4 w-16 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** The tab strip the money and expense screens open with. */
function SkeletonTabs({ count = 3 }) {
  const widths = ["5rem", "4rem", "6rem", "5.5rem"];
  return (
    <div className="flex gap-1.5">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-9 rounded-full"
          style={{ width: widths[i % widths.length] }}
        />
      ))}
    </div>
  );
}

export {
  Skeleton,
  SkeletonText,
  SkeletonParagraph,
  SkeletonPageHeader,
  SkeletonTiles,
  SkeletonRows,
  SkeletonTabs,
};
