import { cn } from "@/lib/utils";

/**
 * One figure with its label.
 *
 * `hint` carries the interpretation — a number like "3" means nothing on its
 * own, and an admin dashboard that makes you work out what you are looking at
 * is a dashboard nobody opens twice.
 */
export function StatTile({ label, value, hint, tone = "default", className }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-background p-4",
        className
      )}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1.5 text-2xl font-semibold tabular-nums leading-none",
          tone === "warn" && "text-amber-600 dark:text-amber-500",
          tone === "bad" && "text-destructive",
          tone === "good" && "text-emerald-600 dark:text-emerald-500"
        )}
      >
        {value}
      </p>
      {hint && (
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

/**
 * A labelled proportion bar.
 *
 * Always renders a visible sliver for any non-zero value, so "one user out of
 * four hundred" does not disappear into a blank track and read as zero.
 */
export function AdoptionBar({ percent, className }) {
  const width = percent > 0 ? Math.max(percent, 1.5) : 0;
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}
      role="img"
      aria-label={`${percent}% of users`}
    >
      <div
        className="h-full rounded-full bg-foreground transition-[width]"
        style={{ width: `${Math.min(width, 100)}%` }}
      />
    </div>
  );
}
