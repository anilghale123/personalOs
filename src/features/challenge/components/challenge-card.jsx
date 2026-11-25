"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  COLOR_STYLES,
  STATUS_LABEL,
} from "@/features/challenge/constants";

/**
 * One row of the challenges list: the title, a Day X/N progress bar in the
 * challenge's colour, today's score, and a status pill.
 *
 * `challenge` is the shape the list route returns (see summarize in
 * `/api/challenges`): it already carries `dayNumber`, `todayScore`, `status`
 * and `loggedDays`, so this stays a dumb presentational row.
 */
export function ChallengeCard({ challenge }) {
  const color = COLOR_STYLES[challenge.color] || COLOR_STYLES.blue;
  const pct = Math.min(
    100,
    Math.round((challenge.dayNumber / challenge.totalDays) * 100)
  );
  const active = challenge.status === "active";

  return (
    <Link
      href={`/app/challenges/${challenge._id}`}
      className="group flex items-center gap-3 rounded-2xl bg-card elev-sm p-4 transition-colors hover:bg-accent/40 sm:gap-4"
    >
      <div
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
          color.soft
        )}
      >
        <Trophy className={cn("h-5 w-5", color.text)} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate font-medium">{challenge.title}</p>
          <StatusPill status={challenge.status} />
        </div>

        <div className="mt-2.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="tabular-nums">
              Day {challenge.dayNumber} of {challenge.totalDays}
            </span>
            <span className="tabular-nums">
              {challenge.todayScore != null
                ? `Today ${challenge.todayScore}%`
                : active
                ? "Not logged yet"
                : `${challenge.loggedDays} days logged`}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full", color.bar)}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function StatusPill({ status }) {
  const map = {
    active: "bg-sage-200 text-sage-900",
    completed: "bg-secondary text-secondary-foreground",
    abandoned: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
        map[status] || map.active
      )}
    >
      {STATUS_LABEL[status] || status}
    </span>
  );
}
