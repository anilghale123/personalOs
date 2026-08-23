import { cn } from "@/lib/utils";

/**
 * "Still learning" — the honest version of an empty state.
 *
 * This is a feature, not an apology. It converts the cold-start problem
 * into visible progress and, more usefully, tells the user exactly which
 * capture habit unlocks which kind of discovery. "Not enough data" tells
 * them nothing; "mood recorded on 11 of the last 30 days, most patterns
 * need 24" tells them what to do next.
 */
export function DataReadiness({ readiness, className, compact = false }) {
  if (!readiness?.domains?.length) return null;

  const pending = readiness.domains.filter((d) => !d.ready);
  const rows = compact ? pending.slice(0, 3) : readiness.domains;
  if (!rows.length) return null;

  return (
    <section className={cn("rounded-xl border bg-card p-4 sm:p-5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium">Still learning</h2>
        <span className="tnum text-xs text-muted-foreground">
          {readiness.windowDays}-day window
        </span>
      </div>

      <ul className="mt-3 space-y-3">
        {rows.map((domain) => {
          const pct = Math.min(100, Math.round((domain.covered / domain.target) * 100));
          return (
            <li key={domain.id}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm">{domain.label}</span>
                <span className="tnum text-xs text-muted-foreground">
                  {domain.ready
                    ? "ready"
                    : `${domain.shortfall} more ${domain.shortfall === 1 ? "day" : "days"}`}
                </span>
              </div>

              <div
                className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuenow={domain.covered}
                aria-valuemin={0}
                aria-valuemax={domain.target}
                aria-label={`${domain.label} coverage`}
              >
                <div
                  className={cn(
                    "h-full rounded-full transition-[width]",
                    domain.ready ? "bg-positive" : "bg-brand"
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>

              <p className="mt-1 text-xs text-muted-foreground">
                <span className="tnum">
                  {domain.covered} of {domain.target} days
                </span>
                {!domain.ready && ` — unlocks: ${domain.unlocks.toLowerCase()}`}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
