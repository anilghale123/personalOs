"use client";

import * as React from "react";
import { Check, ChevronsLeft, ChevronsRight, Clock, X, Trash2 } from "lucide-react";
import { cn, toDateKey } from "@/lib/utils";
import { formatTime } from "@/features/reminders/logic";

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

/** Phones and tablets: the OS time picker, not an inline field. */
function isTouchDevice() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(pointer: coarse)").matches === true
  );
}

/**
 * The goal's time — "6:00 AM" as a chip, or just a quiet clock icon when
 * there is none. It sits on the same line as the done count and is no taller
 * than it, so setting a time never makes the row grow.
 *
 * On a touch screen, tapping opens the phone's own time picker straight from
 * the chip — no inline field to crowd the day boxes — and pressing Set saves
 * at once (Clear removes the time). The native `change` event is used, not
 * React's `onChange`: it fires once the picker is confirmed, not on every
 * turn of an iOS wheel.
 *
 * With a mouse, a narrow inline field opens instead so the time can be typed;
 * Enter or clicking away saves, Escape cancels, × removes the time.
 */
function GoalTime({ time, onChange }) {
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(time || "");
  const pickerRef = React.useRef(null);
  // The native listener below is attached once; these keep it current.
  const latest = React.useRef({ time, onChange });
  latest.current = { time, onChange };

  React.useEffect(() => {
    if (!editing) setValue(time || "");
    if (pickerRef.current) pickerRef.current.value = time || "";
  }, [time, editing]);

  function commit(next) {
    setEditing(false);
    const normalized = next || null;
    if (normalized !== (time || null)) onChange(normalized);
  }

  // A callback ref, so the listener follows the field if it is ever remounted.
  const onPicked = React.useCallback((e) => {
    const normalized = e.target.value || null;
    if (normalized !== (latest.current.time || null)) latest.current.onChange(normalized);
  }, []);
  const attachPicker = React.useCallback(
    (el) => {
      pickerRef.current?.removeEventListener("change", onPicked);
      pickerRef.current = el;
      el?.addEventListener("change", onPicked);
    },
    [onPicked]
  );

  function open() {
    if (!isTouchDevice()) {
      setEditing(true);
      return;
    }
    const el = pickerRef.current;
    try {
      el.showPicker();
    } catch {
      // Older browsers without showPicker open their picker on focus.
      el.focus();
      el.click();
    }
  }

  const label = time ? `Change time, ${formatTime(time)}` : "Set a time";

  // The phone's picker lives in this invisible field over the chip. On a touch
  // screen the tap lands on the field itself: iOS Safari only opens a time
  // picker from a real tap, never from showPicker() or focus() in script.
  const picker = (
    <input
      ref={attachPicker}
      type="time"
      tabIndex={-1}
      aria-hidden="true"
      defaultValue={time || ""}
      className="pointer-events-none absolute -inset-1 z-10 h-[calc(100%+0.5rem)] w-[calc(100%+0.5rem)] cursor-pointer appearance-none opacity-0 [@media(pointer:coarse)]:pointer-events-auto"
    />
  );

  if (editing) {
    return (
      <span className="flex h-4 items-center gap-1">
        <input
          type="time"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => commit(value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setValue(time || "");
              setEditing(false);
            }
          }}
          aria-label="Goal time"
          className="h-5 w-[5.25rem] rounded border border-input bg-background px-0.5 text-[11px] leading-none outline-none focus:ring-1 focus:ring-ring"
        />
        {time && (
          <button
            type="button"
            // Keep the field from blurring (and saving) before this runs.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => commit(null)}
            aria-label="Remove time"
            className="text-muted-foreground hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </span>
    );
  }

  return (
    <span className="relative inline-flex shrink-0">
      {picker}
      <button
        type="button"
        onClick={open}
        aria-label={label}
        className={cn(
          "relative inline-flex h-4 items-center gap-0.5 whitespace-nowrap rounded-full text-[11px] leading-none tabular-nums transition-colors",
          time
            ? "bg-primary/10 px-1.5 font-medium text-primary hover:bg-primary/15"
            : "text-sand-500 hover:text-primary"
        )}
      >
        <Clock className="h-3 w-3" />
        {time && formatTime(time)}
      </button>
    </span>
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
  onUpdateTime,
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
        <div className="flex items-center justify-between gap-2">
          {/* One line: ✓ 1/7 and the time side by side. */}
          <span className="flex h-4 min-w-0 items-center gap-2 whitespace-nowrap">
            <span
              className="inline-flex items-center gap-0.5 text-[11px] leading-none tabular-nums text-sand-600"
              aria-label={`${done} of 7 days done`}
            >
              <Check className="h-3 w-3" />
              {done}/7
            </span>
            <GoalTime
              time={goal.time}
              onChange={(time) => onUpdateTime(goal._id, time)}
            />
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
