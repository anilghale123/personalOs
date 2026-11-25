"use client";

import * as React from "react";
import { TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * For each habit that has sub-items, its variations ranked by how much they
 * have improved since their starting level — "Diamond +60%, Normal +25%".
 *
 * `stats` is the challengeStats().byTracker map; `challenge` is the tree.
 * Only trackers that actually have logs contribute a percentage.
 */
export function VariationBreakdown({ challenge, stats }) {
  const groups = React.useMemo(() => {
    return topLevelWithChildren(challenge)
      .map((parent) => {
        const kids = challenge.trackers.filter(
          (t) => t.parentId && String(t.parentId) === String(parent._id)
        );
        const rows = kids
          .map((k) => {
            const s = stats[String(k._id)];
            if (!s || s.sinceBaselinePct == null) return null;
            return { name: k.name, pct: s.sinceBaselinePct };
          })
          .filter(Boolean)
          .sort((a, b) => b.pct - a.pct);
        return rows.length ? { parent: parent.name, rows } : null;
      })
      .filter(Boolean);
  }, [challenge, stats]);

  if (!groups.length) {
    return (
      <p className="rounded-2xl bg-card elev-sm p-4 text-sm text-muted-foreground">
        Log a few days and your fastest-improving variations will line up here.
      </p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {groups.map((g) => (
        <div key={g.parent} className="rounded-2xl bg-card elev-sm p-4">
          <p className="mb-2 text-sm font-medium">{g.parent}</p>
          <ul className="space-y-1.5">
            {g.rows.map((r) => (
              <li key={r.name} className="flex items-center justify-between">
                <span className="text-sm text-foreground/90">{r.name}</span>
                <span
                  className={cn(
                    "flex items-center gap-1 text-sm font-medium tabular-nums",
                    r.pct >= 0 ? "text-sage-600" : "text-red-600"
                  )}
                >
                  <TrendingUp
                    className={cn("h-3.5 w-3.5", r.pct < 0 && "rotate-180")}
                  />
                  {r.pct >= 0 ? "+" : ""}
                  {Math.round(r.pct)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function topLevelWithChildren(challenge) {
  return (challenge.trackers || []).filter((t) => {
    if (t.parentId || t.archived) return false;
    return challenge.trackers.some(
      (c) => c.parentId && String(c.parentId) === String(t._id)
    );
  });
}
