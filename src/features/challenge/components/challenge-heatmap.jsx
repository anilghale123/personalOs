"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * An N-day grid, one cell per day of the challenge, coloured by that day's
 * score. Adapted from the habit heatmap: instead of a rolling 53-week window
 * it is the fixed span of this challenge, so a completed 88-day run fills
 * exactly 88 cells.
 *
 * `dailyScores` is challengeStats().dailyScores: [{day, date, logged, score}].
 * Unlogged days are left pale; a logged-but-zero day still shows, so a miss
 * reads as a deliberate blank, not a gap.
 */
const STEPS = [
  "hsl(var(--sand-200))",
  "hsl(var(--sage-200))",
  "hsl(var(--sage-400))",
  "hsl(var(--sage-600))",
];

function colorFor(d) {
  if (!d.logged) return "hsl(var(--sand-200) / 0.4)";
  if (d.score <= 0) return STEPS[0];
  const r = Math.min(1, d.score / 100);
  if (r < 0.34) return STEPS[1];
  if (r < 0.67) return STEPS[2];
  return STEPS[3];
}

export function ChallengeHeatmap({ dailyScores, totalDays }) {
  const cells = React.useMemo(() => {
    const byDay = new Map(dailyScores.map((d) => [d.day, d]));
    const out = [];
    for (let d = 1; d <= totalDays; d += 1) {
      out.push(byDay.get(d) || { day: d, logged: false, score: 0 });
    }
    return out;
  }, [dailyScores, totalDays]);

  return (
    <div className="rounded-2xl bg-card elev-sm p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium">Day scores</p>
        <Legend />
      </div>
      <div className="grid grid-flow-col grid-rows-7 gap-1 overflow-x-auto pb-1">
        {cells.map((d) => (
          <div
            key={d.day}
            title={`Day ${d.day}${
              d.logged ? ` — ${d.score}%` : " — not logged"
            }`}
            className={cn("h-3.5 w-3.5 rounded-[3px]", !d.logged && "opacity-60")}
            style={{ background: colorFor(d) }}
          />
        ))}
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <span>Low</span>
      {STEPS.map((s, i) => (
        <span
          key={i}
          className="h-2.5 w-2.5 rounded-[2px]"
          style={{ background: s }}
        />
      ))}
      <span>High</span>
    </div>
  );
}
