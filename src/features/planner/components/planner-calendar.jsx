"use client";

import * as React from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  parseISO,
  format,
  isSameMonth,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn, toDateKey } from "@/lib/utils";
import { completionTone } from "@/features/planner/utils";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

/**
 * Month view where each **row is a week** — pick one to jump the planner
 * there. Rows carry that week's completion so past weeks are readable at
 * a glance.
 */
export function PlannerCalendar({ weekStart, onSelect, refreshKey = 0 }) {
  const [viewMonth, setViewMonth] = React.useState(() =>
    startOfMonth(parseISO(weekStart))
  );
  const [stats, setStats] = React.useState({});

  // Follow the selected week when the arrows cross a month boundary.
  React.useEffect(() => {
    setViewMonth(startOfMonth(parseISO(weekStart)));
  }, [weekStart]);

  const weeks = React.useMemo(() => {
    const days = eachDayOfInterval({
      start: startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 1 }),
      end: endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 1 }),
    });
    const rows = [];
    for (let i = 0; i < days.length; i += 7) {
      rows.push({ key: toDateKey(days[i]), days: days.slice(i, i + 7) });
    }
    return rows;
  }, [viewMonth]);

  // Load completion for every week the month shows.
  React.useEffect(() => {
    const from = weeks[0].key;
    const to = weeks[weeks.length - 1].key;
    let cancelled = false;
    fetch(`/api/planner/history?from=${from}&to=${to}&limit=10`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !Array.isArray(data)) return;
        setStats(Object.fromEntries(data.map((w) => [w.weekStart, w])));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [weeks, refreshKey]);

  const todayKey = toDateKey();

  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium">
          {format(viewMonth, "MMMM yyyy")}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setViewMonth((m) => addMonths(m, -1))}
            aria-label="Previous month"
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewMonth(startOfMonth(new Date()))}
            disabled={isSameMonth(viewMonth, new Date())}
            className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setViewMonth((m) => addMonths(m, 1))}
            aria-label="Next month"
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[repeat(7,minmax(0,1fr))_48px] gap-0.5 px-1 pb-1">
        {WEEKDAYS.map((d, i) => (
          <div
            key={i}
            className="text-center text-[10px] font-medium uppercase text-muted-foreground"
          >
            {d}
          </div>
        ))}
        <div className="text-center text-[10px] font-medium uppercase text-muted-foreground">
          Done
        </div>
      </div>

      <div className="space-y-0.5">
        {weeks.map((week) => {
          const stat = stats[week.key];
          const selected = week.key === weekStart;
          return (
            <button
              key={week.key}
              type="button"
              onClick={() => onSelect(week.key)}
              aria-label={`Week of ${format(week.days[0], "MMM d, yyyy")}`}
              aria-current={selected ? "true" : undefined}
              className={cn(
                "grid w-full grid-cols-[repeat(7,minmax(0,1fr))_48px] items-center gap-0.5 rounded-lg p-1 transition-colors",
                selected
                  ? "bg-accent ring-1 ring-primary"
                  : "hover:bg-accent/60"
              )}
            >
              {week.days.map((day) => {
                const key = toDateKey(day);
                return (
                  <span
                    key={key}
                    className={cn(
                      "flex h-7 items-center justify-center rounded-md text-xs tabular-nums",
                      !isSameMonth(day, viewMonth) && "opacity-35",
                      key === todayKey &&
                        "bg-primary/10 font-semibold text-primary"
                    )}
                  >
                    {format(day, "d")}
                  </span>
                );
              })}
              <span
                className={cn(
                  "rounded-md px-1 py-0.5 text-[11px] font-semibold tabular-nums",
                  completionTone(stat?.completion ?? 0, { empty: !stat })
                )}
              >
                {stat ? `${stat.completion}%` : "–"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
