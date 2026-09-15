"use client";

import * as React from "react";
import { Check, ChevronsLeft, ChevronsRight, X, Trash2 } from "lucide-react";
import { cn, toDateKey } from "@/lib/utils";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// Tapping a cell cycles through the three states.
const NEXT = { pending: "done", done: "missed", missed: "pending" };

/**
 * Phone-only button floating on the border just left of today's header, so
 * it never covers the day label: it opens
 * the days before today, then folds them away again.
 */
export function ExpandToggle({ expanded, hiddenDays, onToggle }) {
  const days = `${hiddenDays} earlier ${hiddenDays === 1 ? "day" : "days"}`;
  const Icon = expanded ? ChevronsRight : ChevronsLeft;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-label={expanded ? `Hide ${days}` : `Show ${days}`}
      // The negative inset widens the hit area without adding to the look.
      className="absolute -left-3 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border bg-card text-primary shadow-sm before:absolute before:-inset-2 active:bg-accent md:hidden"
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

/** One day cell — a tri-state toggle: pending → done → missed. */
function DayToggle({ status, isToday, className, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(NEXT[status])}
      aria-label={`Mark ${status === "done" ? "missed" : status === "missed" ? "pending" : "done"}`}
      className={cn(
        "m-1 flex min-h-[44px] items-center justify-center rounded-[8px] transition-colors",
        className,
        status === "done" && "bg-sage-500 text-sand-100 hover:bg-sage-600",
        status === "missed" && "bg-clay-300 text-clay-900 hover:bg-clay-400",
        status === "pending" &&
          cn(
            "border border-border text-sand-400 hover:bg-sand-200",
            isToday && "border-primary/40"
          )
      )}
    >
      {/* Keyed by status so the pop replays on every change. */}
      {status === "done" && (
        <Check key="done" className="h-4 w-4 animate-check-pop" />
      )}
      {status === "missed" && (
        <X key="missed" className="h-4 w-4 animate-check-pop" />
      )}
      {status === "pending" && (
        <span key="pending" className="text-[15px] leading-none">
          ·
        </span>
      )}
    </button>
  );
}

/**
 * A planner goal row — editable title in the Goals column, followed by
 * a done/missed toggle for each day of the week.
 *
 * Memoised: the screen keeps stable callbacks and a stable weekDates,
 * so a tap on one cell re-renders only this row, not the whole grid.
 */
function PlannerGoalRowInner({
  goal,
  weekDates,
  todayKey,
  gridCols,
  hiddenDays,
  onUpdateDay,
  onUpdateTitle,
  onDelete,
}) {
  const [editing, setEditing] = React.useState(false);
  const [title, setTitle] = React.useState(goal.title);

  React.useEffect(() => {
    if (!editing) setTitle(goal.title);
  }, [goal.title, editing]);

  function commitTitle() {
    setEditing(false);
    const trimmed = title.trim();
    if (!trimmed || trimmed === goal.title) {
      setTitle(goal.title); // revert empty / unchanged
      return;
    }
    onUpdateTitle(goal._id, trimmed);
  }

  const statuses = DAYS.map((d) => goal.days?.[d] || "pending");
  const done = statuses.filter((s) => s === "done").length;

  return (
    <div className={cn("group grid border-b border-border last:border-b-0", gridCols)}>
      {/* Goals column */}
      <div className="flex flex-col justify-center gap-0.5 p-2">
        {editing ? (
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setTitle(goal.title);
                setEditing(false);
              }
            }}
            className="w-full rounded-md border border-input bg-background px-1.5 py-1 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-left text-[15px] leading-snug hover:text-primary"
          >
            {goal.title}
          </button>
        )}
        <div className="flex items-center justify-between">
          <span className="text-[11px] tabular-nums text-sand-600">
            {done}/7 done
          </span>
          <button
            type="button"
            onClick={() => onDelete(goal._id)}
            aria-label="Delete goal"
            className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Day toggles — on a phone the days before today may be folded */}
      {DAYS.map((day, i) => (
        <DayToggle
          key={day}
          status={goal.days?.[day] || "pending"}
          isToday={toDateKey(weekDates[i]) === todayKey}
          className={i < hiddenDays ? "max-md:hidden" : undefined}
          onChange={(status) => onUpdateDay(goal._id, day, status)}
        />
      ))}
    </div>
  );
}

export const PlannerGoalRow = React.memo(PlannerGoalRowInner);
