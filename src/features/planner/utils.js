export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Per-week done/missed/pending tallies for one goal row. */
export function goalTally(goal) {
  const statuses = DAYS.map((d) => goal.days?.[d] || "pending");
  const done = statuses.filter((s) => s === "done").length;
  const missed = statuses.filter((s) => s === "missed").length;
  return { done, missed, pending: DAYS.length - done - missed };
}

/**
 * Grid filters. Deliberately overlapping — a goal with some done and
 * some missed days shows up under both "In progress" and "Missed".
 */
export const GOAL_FILTERS = [
  { id: "all", label: "All", match: () => true },
  {
    id: "completed",
    label: "Completed",
    match: (t) => t.done === DAYS.length,
  },
  {
    id: "progress",
    label: "In progress",
    match: (t) => t.done > 0 && t.done < DAYS.length,
  },
  { id: "missed", label: "Missed", match: (t) => t.missed > 0 },
  {
    id: "untouched",
    label: "Not started",
    match: (t) => t.done === 0 && t.missed === 0,
  },
];

/** Completion colour band, shared by the calendar and the history list. */
export function completionTone(pct, { empty = false } = {}) {
  if (empty) return "bg-muted/60 text-muted-foreground";
  if (pct >= 75) return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
  if (pct >= 40) return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
  if (pct > 0) return "bg-red-500/10 text-red-600 dark:text-red-400";
  return "bg-muted text-muted-foreground";
}

/** Bar fill matching {@link completionTone}. */
export function completionBar(pct) {
  if (pct >= 75) return "bg-emerald-500";
  if (pct >= 40) return "bg-amber-500";
  if (pct > 0) return "bg-red-500";
  return "bg-muted-foreground/30";
}
