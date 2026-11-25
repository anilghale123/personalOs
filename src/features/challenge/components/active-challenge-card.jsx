"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight, Trophy } from "lucide-react";
import { COLOR_STYLES } from "../constants";

/**
 * The home-page hook for an active challenge.
 *
 * Self-fetching on purpose: the home route is prerendered and carries its
 * own /api/patterns/home payload, so coupling the challenge into that would
 * make the front door wait on a second collection. A one-shot GET to the
 * list is cheaper and stays independent. Renders nothing when there is no
 * active challenge — it is a nudge, not a section.
 */
export function ActiveChallengeCard() {
  const [challenges, setChallenges] = React.useState(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/challenges?status=active");
      if (!res.ok) return;
      const data = await res.json();
      if (!cancelled) setChallenges(data || []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!challenges) return null; // keep the home page from flashing

  const active = challenges.find((c) => c.status === "active");
  if (!active) return null;

  const style = COLOR_STYLES[active.color] || COLOR_STYLES.green;
  const day = active.dayNumber ?? 1;
  const totalDays = active.totalDays ?? 1;
  const pct = Math.min(100, Math.round((day / totalDays) * 100));
  const loggedToday = active.todayScore != null;

  return (
    <Link
      href={`/app/challenges/${active._id}`}
      className="block rounded-3xl border border-border bg-card p-5 elev-sm transition-transform hover:-translate-y-[1px]"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${style.soft} ${style.text}`}
          >
            <Trophy className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="kicker text-[11px]">
              Day {day} of {totalDays}
            </p>
            <p className="truncate font-display text-[18px] leading-tight">
              {active.title}
            </p>
          </div>
        </div>
        {loggedToday && (
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${style.soft} ${style.text}`}
          >
            {active.todayScore}%
          </span>
        )}
      </div>

      <div className="mt-3.5 flex items-center gap-3">
        <div className={`h-2 flex-1 overflow-hidden rounded-full ${style.soft}`}>
          <div
            className={`h-full rounded-full ${style.bar}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="flex items-center gap-0.5 text-[13px] font-medium text-muted-foreground">
          {loggedToday ? "Open" : "Log today"}
          <ChevronRight className="h-4 w-4" />
        </span>
      </div>
    </Link>
  );
}
