"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const CELL = 12;
const GAP = 3;
const WEEKS = 53;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** ISO date key for a Date. */
function key(d) {
  return d.toISOString().split("T")[0];
}

/**
 * GitHub-style contribution heatmap for habit completion.
 *
 * @param {object} props
 * @param {Record<string, number>} props.values - { 'YYYY-MM-DD': intensity }
 * @param {number} [props.maxIntensity] - value mapped to the darkest cell
 * @param {(dateKey: string) => void} [props.onCellClick]
 */
export function HabitHeatmap({ values = {}, maxIntensity = 1, onCellClick }) {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="overflow-x-auto scrollbar-thin">
        <div className="h-[90px]" />
      </div>
    );
  }

  // Build a 53-week grid ending on the current week (Sun-anchored columns).
  const today = new Date();
  const end = new Date(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  );
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (WEEKS * 7 - 1));
  start.setUTCDate(start.getUTCDate() - start.getUTCDay()); // back to Sunday

  const columns = [];
  const monthLabels = [];
  let cursor = new Date(start);

  for (let w = 0; w < WEEKS; w++) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const k = key(cursor);
      week.push({
        date: k,
        future: cursor > end,
        intensity: values[k] || 0,
      });
      if (cursor.getUTCDate() <= 7 && d === 0) {
        monthLabels.push({ col: w, label: MONTHS[cursor.getUTCMonth()] });
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    columns.push(week);
  }

  const width = WEEKS * (CELL + GAP);
  const height = 7 * (CELL + GAP);

  function colorFor(cell) {
    if (cell.future) return "transparent";
    if (cell.intensity <= 0) return "hsl(var(--muted))";
    const ratio = Math.min(cell.intensity / maxIntensity, 1);
    // emerald scale
    const light = 88 - ratio * 50;
    return `hsl(152 60% ${light}%)`;
  }

  return (
    <div className="overflow-x-auto scrollbar-thin">
      <svg
        width={width}
        height={height + 18}
        className="select-none"
        role="img"
        aria-label="Habit completion heatmap"
      >
        {monthLabels.map((m, i) => (
          <text
            key={i}
            x={m.col * (CELL + GAP)}
            y={10}
            className="fill-muted-foreground text-[9px]"
          >
            {m.label}
          </text>
        ))}
        <g transform="translate(0,16)">
          {columns.map((week, wi) =>
            week.map((cell, di) => (
              <rect
                key={cell.date}
                x={wi * (CELL + GAP)}
                y={di * (CELL + GAP)}
                width={CELL}
                height={CELL}
                rx={2.5}
                fill={colorFor(cell)}
                className={cn(
                  "stroke-border",
                  !cell.future &&
                    onCellClick &&
                    "cursor-pointer transition-opacity hover:opacity-70"
                )}
                strokeWidth={cell.future ? 0 : 0.5}
                onClick={() =>
                  !cell.future && onCellClick?.(cell.date)
                }
              >
                <title>
                  {cell.date}
                  {cell.intensity > 0
                    ? ` — ${cell.intensity} completed`
                    : ""}
                </title>
              </rect>
            ))
          )}
        </g>
      </svg>
    </div>
  );
}

/** Legend strip for the heatmap intensity scale. */
export function HeatmapLegend() {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span>Less</span>
      {[0, 0.33, 0.66, 1].map((r) => (
        <span
          key={r}
          className="h-3 w-3 rounded-sm border border-border"
          style={{
            background:
              r === 0
                ? "hsl(var(--muted))"
                : `hsl(152 60% ${88 - r * 50}%)`,
          }}
        />
      ))}
      <span>More</span>
    </div>
  );
}
