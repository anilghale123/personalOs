"use client";

import * as React from "react";
import { Check, ChevronsLeft, ChevronsRight, Clock, X, Trash2 } from "lucide-react";
import { cn, toDateKey } from "@/lib/utils";
import { formatTime, parseTypedTime } from "@/features/reminders/logic";

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
 * The goal's time — "6:00 AM" as a chip, or just a quiet clock icon when
 * there is none. It sits on the same line as the done count, so setting a
 * time doesn't make the row grow.
 *
 * Tapping the chip opens a small editor, the same on every device: type the
 * time ("6:30 pm", "630pm", "18:30"), or tap the clock for the phone's own
 * picker, which only fills the field — iOS reports every turn of its wheel,
 * so nothing is saved until ✓ (or Enter) is pressed. Emptying the field and
 * pressing ✓ removes the time. Escape or tapping elsewhere cancels.
 */
function GoalTime({ time, onChange, onEditingChange }) {
  const [editing, setEditing] = React.useState(false);
  const [text, setText] = React.useState("");
  const [invalid, setInvalid] = React.useState(false);
  const wrapRef = React.useRef(null);
  const pickerRef = React.useRef(null);

  React.useEffect(() => {
    if (pickerRef.current) pickerRef.current.value = time || "";
  }, [time, editing]);

  // The row makes room for the editor while it's open.
  React.useEffect(() => {
    onEditingChange?.(editing);
  }, [editing, onEditingChange]);

  function close() {
    setEditing(false);
    setInvalid(false);
  }

  function save() {
    const raw = text.trim();
    const next = raw ? parseTypedTime(raw) : null;
    if (raw && !next) {
      setInvalid(true);
      return;
    }
    close();
    if (next !== (time || null)) onChange(next);
  }

  // Tapping anywhere outside the editor cancels it.
  React.useEffect(() => {
    if (!editing) return undefined;
    function onPointer(e) {
      if (wrapRef.current?.contains(e.target)) return;
      setEditing(false);
      setInvalid(false);
    }
    document.addEventListener("pointerdown", onPointer, true);
    return () => document.removeEventListener("pointerdown", onPointer, true);
  }, [editing]);

  // The picker only fills the field. Native listeners, since iOS fires
  // `input`/`change` as the wheel turns and React's onChange hides which.
  const onPicked = React.useCallback((e) => {
    setText(e.target.value ? formatTime(e.target.value) : "");
    setInvalid(false);
  }, []);
  // A callback ref, so the listeners follow the field if it is ever remounted.
  const attachPicker = React.useCallback(
    (el) => {
      pickerRef.current?.removeEventListener("input", onPicked);
      pickerRef.current?.removeEventListener("change", onPicked);
      pickerRef.current = el;
      el?.addEventListener("input", onPicked);
      el?.addEventListener("change", onPicked);
    },
    [onPicked]
  );

  function startEditing() {
    setText(time ? formatTime(time) : "");
    setInvalid(false);
    setEditing(true);
  }

  function openPicker() {
    // With a mouse the picker opens from script. On a touch screen the tap
    // lands on the invisible field itself: iOS Safari only opens a time
    // picker from a real tap on it.
    try {
      pickerRef.current?.showPicker();
    } catch {
      // No picker here (e.g. desktop Firefox) — typing still works.
    }
  }

  if (editing) {
    return (
      <span ref={wrapRef} className="inline-flex shrink-0 items-center gap-2.5">
        <input
          type="text"
          inputMode="text"
          enterKeyHint="done"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus
          value={text}
          placeholder="6:30 pm"
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            setText(e.target.value);
            setInvalid(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            }
            if (e.key === "Escape") close();
          }}
          aria-label="Goal time"
          aria-invalid={invalid || undefined}
          title="Type a time, e.g. 6:30 pm or 18:30 — leave empty to remove it"
          className={cn(
            // On a phone the field is finger-sized (and 16px, so iOS doesn't
            // zoom); the line grows only while it's open.
            "h-5 w-[5.25rem] rounded border bg-background px-1 text-[11px] leading-none outline-none focus:ring-1 [@media(pointer:coarse)]:h-8 [@media(pointer:coarse)]:w-[4.75rem]",
            invalid
              ? "border-destructive focus:ring-destructive"
              : "border-input focus:ring-ring"
          )}
        />
        <span className="relative inline-flex">
          <input
            ref={attachPicker}
            type="time"
            tabIndex={-1}
            aria-hidden="true"
            defaultValue={time || ""}
            className="pointer-events-none absolute -left-2 -top-2 z-10 h-[calc(100%+1rem)] w-[calc(100%+1rem)] cursor-pointer appearance-none opacity-0 [@media(pointer:coarse)]:pointer-events-auto"
          />
          <button
            type="button"
            onClick={openPicker}
            aria-label="Pick a time"
            className="relative inline-flex items-center justify-center text-sand-500 hover:text-primary"
          >
            <Clock className="h-3.5 w-3.5 [@media(pointer:coarse)]:h-4 [@media(pointer:coarse)]:w-4" />
          </button>
        </span>
        <button
          type="button"
          onClick={save}
          aria-label="Save time"
          // The pseudo-element gives a thumb more to hit than the small icon.
          className="relative inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground before:absolute before:-inset-2 hover:bg-primary/90 [@media(pointer:coarse)]:h-7 [@media(pointer:coarse)]:w-7"
        >
          <Check className="h-3 w-3 [@media(pointer:coarse)]:h-4 [@media(pointer:coarse)]:w-4" />
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      aria-label={time ? `Change time, ${formatTime(time)}` : "Set a time"}
      className={cn(
        // A touch larger on phones; the negative margin keeps the line from
        // growing. The pseudo-element widens the hit area.
        "relative inline-flex h-4 shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full text-[11px] leading-none tabular-nums transition-colors before:absolute before:-inset-x-2 before:-inset-y-1.5 [@media(pointer:coarse)]:-my-0.5 [@media(pointer:coarse)]:h-5 [@media(pointer:coarse)]:gap-1 [@media(pointer:coarse)]:text-xs",
        time
          ? "bg-primary/10 px-1.5 font-medium text-primary hover:bg-primary/15 [@media(pointer:coarse)]:px-2"
          : "text-sand-500 hover:text-primary"
      )}
    >
      <Clock className="h-3 w-3 [@media(pointer:coarse)]:h-3.5 [@media(pointer:coarse)]:w-3.5" />
      {time && formatTime(time)}
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
  onUpdateTime,
  onDelete,
}) {
  const [editing, setEditing] = React.useState(false);
  const [title, setTitle] = React.useState(goal.title);
  // A narrow phone column can't fit the time editor beside the count and the
  // trash icon, so those step aside while it's open.
  const [timeEditing, setTimeEditing] = React.useState(false);

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
          <span className="flex min-h-4 min-w-0 items-center gap-2 whitespace-nowrap">
            <span
              className={cn(
                "inline-flex items-center gap-0.5 text-[11px] leading-none tabular-nums text-sand-600",
                timeEditing && "hidden"
              )}
              aria-label={`${done} of 7 days done`}
            >
              <Check className="h-3 w-3" />
              {done}/7
            </span>
            <GoalTime
              time={goal.time}
              onChange={(time) => onUpdateTime(goal._id, time)}
              onEditingChange={setTimeEditing}
            />
          </span>
          <button
            type="button"
            onClick={() => onDelete(goal._id)}
            aria-label="Delete goal"
            className={cn("text-muted-foreground hover:text-destructive", timeEditing && "hidden")}
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
