"use client";

import * as React from "react";
import { addDays, parseISO, format } from "date-fns";
import { History, Loader2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { weekStartKey } from "@/lib/week";
import { EmptyState } from "@/components/empty-state";
import {
  DAYS,
  completionTone,
  completionBar,
} from "@/features/planner/utils";

const RANGES = [
  { id: "8", label: "8 weeks", limit: 8 },
  { id: "26", label: "6 months", limit: 26 },
  { id: "52", label: "1 year", limit: 52 },
  { id: "all", label: "All", limit: 260 },
];

/** "Aug 10 – Aug 16, 2026" for a Monday key. */
function weekLabelFor(weekStart) {
  const start = parseISO(weekStart);
  return `${format(start, "MMM d")} – ${format(
    addDays(start, 6),
    "MMM d, yyyy"
  )}`;
}

/**
 * Past weeks, newest first — completion, done/missed tallies and the
 * goals that were on the board. Picking a week opens it in the grid.
 */
export function PlannerHistory({ activeWeekStart, onOpenWeek, refreshKey = 0 }) {
  const [range, setRange] = React.useState("8");
  const [weeks, setWeeks] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);

  const limit = RANGES.find((r) => r.id === range).limit;

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetch(`/api/planner/history?limit=${limit}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => {
        if (!cancelled) setWeeks(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [limit, refreshKey]);

  const currentWeek = weekStartKey();
  const past = (weeks || []).filter((w) => w.weekStart !== currentWeek);
  const average = past.length
    ? Math.round(past.reduce((s, w) => s + w.completion, 0) / past.length)
    : 0;
  const best = past.reduce(
    (top, w) => (!top || w.completion > top.completion ? w : top),
    null
  );

  return (
    <div className="space-y-4">
      {/* Range filter */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-medium text-muted-foreground">
          Show
        </span>
        {RANGES.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setRange(r.id)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
              range === r.id
                ? "border-primary bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent"
            )}
          >
            {r.label}
          </button>
        ))}
        {loading && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Roll-up across the weeks shown */}
      {past.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Weeks tracked" value={past.length} />
          <Stat label="Avg. completion" value={`${average}%`} />
          <Stat
            label="Best week"
            value={best ? `${best.completion}%` : "–"}
            hint={best ? format(parseISO(best.weekStart), "MMM d") : null}
          />
        </div>
      )}

      {error ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Could not load your history. Please try again.
        </p>
      ) : !loading && past.length === 0 ? (
        <EmptyState
          icon={History}
          title="No past weeks yet"
          description="Once you plan and check off a week, it shows up here so you can look back on how it went."
        />
      ) : (
        <div className="space-y-2">
          {past.map((week) => {
            const cells = week.goalCount * DAYS.length;
            return (
              <button
                key={week.weekStart}
                type="button"
                onClick={() => onOpenWeek(week.weekStart)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:bg-accent/50",
                  week.weekStart === activeWeekStart && "ring-1 ring-primary"
                )}
              >
                <span
                  className={cn(
                    "flex h-11 w-12 shrink-0 items-center justify-center rounded-lg text-sm font-semibold tabular-nums",
                    completionTone(week.completion)
                  )}
                >
                  {week.completion}%
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">
                    {weekLabelFor(week.weekStart)}
                  </span>
                  <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <span
                      className={cn(
                        "block h-full rounded-full",
                        completionBar(week.completion)
                      )}
                      style={{ width: `${week.completion}%` }}
                    />
                  </span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                    <span className="tabular-nums">
                      {week.goalCount} goal{week.goalCount === 1 ? "" : "s"}
                    </span>
                    <span className="tabular-nums text-emerald-600 dark:text-emerald-400">
                      {week.done}/{cells} done
                    </span>
                    {week.missed > 0 && (
                      <span className="tabular-nums text-red-600 dark:text-red-400">
                        {week.missed} missed
                      </span>
                    )}
                  </span>
                  {week.titles.length > 0 && (
                    <span className="mt-1 block truncate text-[11px] text-muted-foreground">
                      {week.titles.join(" · ")}
                    </span>
                  )}
                </span>

                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, hint }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
