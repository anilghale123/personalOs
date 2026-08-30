"use client";

import * as React from "react";
import { Check, X, Trash2 } from "lucide-react";
import { cn, toDateKey } from "@/lib/utils";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// Tapping a cell cycles through the three states.
const NEXT = { pending: "done", done: "missed", missed: "pending" };

/** One day cell — a tri-state toggle: pending → done → missed. */
function DayToggle({ status, isToday, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(NEXT[status])}
      aria-label={`Mark ${status === "done" ? "missed" : status === "missed" ? "pending" : "done"}`}
      className={cn(
        "flex h-full min-h-[46px] w-full items-center justify-center border-l transition-colors",
        status === "done" && "bg-emerald-500/10 hover:bg-emerald-500/20",
        status === "missed" && "bg-red-500/10 hover:bg-red-500/20",
        status === "pending" &&
          cn("hover:bg-muted/60", isToday && "bg-primary/5")
      )}
    >
      {/* Keyed by status so the pop replays on every change. */}
      {status === "done" && (
        <Check
          key="done"
          className="h-4 w-4 animate-check-pop text-emerald-600 dark:text-emerald-400"
        />
      )}
      {status === "missed" && (
        <X
          key="missed"
          className="h-4 w-4 animate-check-pop text-red-600 dark:text-red-400"
        />
      )}
      {status === "pending" && (
        <span
          key="pending"
          className="h-3.5 w-3.5 rounded-full border border-dashed border-muted-foreground/40"
        />
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
    <div className={cn("group grid border-b last:border-b-0", gridCols)}>
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
            className="text-left text-sm font-medium leading-snug hover:text-primary"
          >
            {goal.title}
          </button>
        )}
        <div className="flex items-center justify-between">
          <span className="text-[10px] tabular-nums text-muted-foreground">
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

      {/* Day toggles */}
      {DAYS.map((day, i) => (
        <DayToggle
          key={day}
          status={goal.days?.[day] || "pending"}
          isToday={toDateKey(weekDates[i]) === todayKey}
          onChange={(status) => onUpdateDay(goal._id, day, status)}
        />
      ))}
    </div>
  );
}

export const PlannerGoalRow = React.memo(PlannerGoalRowInner);
