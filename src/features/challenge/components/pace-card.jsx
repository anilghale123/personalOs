"use client";

import * as React from "react";
import { Gauge, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { PACE_STATUS } from "@/features/challenge/constants";
import { paceMessage } from "@/features/challenge/utils";

/**
 * The "will I make it?" card for one top-level habit: a status pill and the
 * one-line projection message, plus (for a value tracker) the current level
 * against the goal.
 *
 * `stats` is one entry from challengeStats().byTracker; `totalDays` is the
 * challenge length, which the message needs to say "by day N".
 */
export function PaceCard({ stats, totalDays }) {
  const p = stats?.pace;
  if (!p) return null;

  const status = PACE_STATUS[p.status] || PACE_STATUS.not_enough_data;
  const Icon =
    p.status === "on_track"
      ? TrendingUp
      : p.status === "behind"
      ? TrendingDown
      : Gauge;
  const message = paceMessage(stats, totalDays);

  return (
    <div className="rounded-2xl bg-card elev-sm p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate font-medium">{stats.name}</p>
        <span
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium",
            status.className
          )}
        >
          <Icon className="h-3 w-3" />
          {status.label}
        </span>
      </div>

      <p className="mt-2 text-sm leading-snug text-foreground/90">{message}</p>

      {stats.goal != null && p.metric !== "check" && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              Now:{" "}
              <span className="tabular-nums text-foreground">
                {round(stats.currentLevel)}
              </span>
            </span>
            <span>
              Goal: <span className="tabular-nums">{stats.goal}</span>
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{
                width: `${Math.min(100, Math.max(0, stats.progressToGoal ?? 0))}%`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function round(n) {
  if (n == null) return "—";
  return Number.isInteger(n) ? n : n.toFixed(1);
}
