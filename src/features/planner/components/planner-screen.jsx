"use client";

import * as React from "react";
import { addDays, parseISO, format } from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  CalendarRange,
  Plus,
  Target,
} from "lucide-react";
import { toast } from "sonner";
import { cn, toDateKey } from "@/lib/utils";
import { weekStartKey } from "@/lib/week";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
import { PlannerGoalRow } from "./planner-goal-row";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const GRID_COLS = "grid-cols-[minmax(150px,1.8fr)_repeat(7,minmax(0,1fr))]";
const JSON_HEADERS = { "Content-Type": "application/json" };

export function PlannerScreen({ initialWeekStart, initialGoals }) {
  const [weekStart, setWeekStart] = React.useState(initialWeekStart);
  const [goals, setGoals] = React.useState(initialGoals || []);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(0);
  const [newTitle, setNewTitle] = React.useState("");
  // Guards against a slow fetch overwriting the grid after navigation.
  const weekRef = React.useRef(initialWeekStart);

  const loadWeek = React.useCallback(async (ws) => {
    weekRef.current = ws;
    setWeekStart(ws);
    setLoading(true);
    try {
      const res = await fetch(`/api/planner?weekStart=${ws}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (weekRef.current === ws) setGoals(data);
    } catch {
      toast.error("Could not load that week.");
    } finally {
      if (weekRef.current === ws) setLoading(false);
    }
  }, []);

  // The server renders "today" in its own timezone (UTC on Vercel);
  // re-anchor to the viewer's actual local week if it differs.
  React.useEffect(() => {
    const localWeek = weekStartKey();
    if (localWeek !== initialWeekStart) loadWeek(localWeek);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function shiftWeek(deltaWeeks) {
    loadWeek(
      format(addDays(parseISO(weekStart), deltaWeeks * 7), "yyyy-MM-dd")
    );
  }

  async function addGoal() {
    const title = newTitle.trim();
    if (!title) return;
    const ws = weekStart;
    setNewTitle("");
    setSaving((n) => n + 1);
    try {
      const res = await fetch("/api/planner", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ weekStart: ws, title }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      const created = await res.json();
      if (weekRef.current === ws) setGoals((g) => [...g, created]);
    } catch (err) {
      toast.error(err.message || "Could not add goal.");
    } finally {
      setSaving((n) => n - 1);
    }
  }

  /** Optimistically patch a goal, rolling back the row on failure. */
  async function patchGoal(goalId, body, optimistic) {
    const before = goals;
    setGoals((g) => g.map((x) => (x._id === goalId ? optimistic(x) : x)));
    setSaving((n) => n + 1);
    try {
      const res = await fetch(`/api/planner/${goalId}`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setGoals((g) => g.map((x) => (x._id === goalId ? updated : x)));
    } catch {
      setGoals(before); // rollback
      toast.error("Could not save — please try again.");
    } finally {
      setSaving((n) => n - 1);
    }
  }

  function updateDay(goalId, day, status) {
    patchGoal(goalId, { day, status }, (g) => ({
      ...g,
      days: { ...g.days, [day]: status },
    }));
  }

  function updateTitle(goalId, title) {
    patchGoal(goalId, { title }, (g) => ({ ...g, title }));
  }

  async function deleteGoal(goalId) {
    const before = goals;
    setGoals((g) => g.filter((x) => x._id !== goalId));
    try {
      const res = await fetch(`/api/planner/${goalId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      setGoals(before); // rollback
      toast.error("Could not delete goal.");
    }
  }

  const weekDates = DAYS.map((_, i) => addDays(parseISO(weekStart), i));
  const todayKey = toDateKey();
  const start = parseISO(weekStart);
  const label = `${format(start, "MMM d")} – ${format(
    addDays(start, 6),
    "MMM d, yyyy"
  )}`;
  const isCurrentWeek = weekStart === weekStartKey();

  const totalDone = goals.reduce(
    (sum, g) => sum + DAYS.filter((d) => g.days?.[d] === "done").length,
    0
  );
  const overall = goals.length
    ? Math.round((totalDone / (goals.length * 7)) * 100)
    : 0;

  return (
    <div className="space-y-4">
      {/* Week navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-base font-semibold">
            <CalendarRange className="h-4 w-4 text-muted-foreground" />
            {label}
          </h2>
          <p className="text-xs text-muted-foreground">
            {saving > 0
              ? "Saving…"
              : goals.length > 0
              ? `${overall}% of goals completed this week`
              : "Add goals below, then tap a day to mark it done."}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            onClick={() => shiftWeek(-1)}
            aria-label="Previous week"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant={isCurrentWeek ? "secondary" : "outline"}
            size="sm"
            onClick={() => loadWeek(weekStartKey())}
            disabled={isCurrentWeek}
          >
            This week
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => shiftWeek(1)}
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Planner grid */}
      <div className="overflow-x-auto rounded-xl border bg-card">
        <div
          className={cn(
            "min-w-[680px] transition-opacity",
            loading && "pointer-events-none opacity-50"
          )}
        >
          {/* Header row */}
          <div className={cn("grid border-b bg-muted/40", GRID_COLS)}>
            <div className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Goals
            </div>
            {DAYS.map((day, i) => {
              const isToday = toDateKey(weekDates[i]) === todayKey;
              return (
                <div
                  key={day}
                  className={cn(
                    "border-l px-1 py-2 text-center",
                    isToday && "bg-primary/10"
                  )}
                >
                  <p
                    className={cn(
                      "text-[11px] font-semibold uppercase tracking-wider",
                      isToday ? "text-primary" : "text-muted-foreground"
                    )}
                  >
                    {day}
                  </p>
                  <p
                    className={cn(
                      "text-xs tabular-nums",
                      isToday
                        ? "font-semibold text-primary"
                        : "text-muted-foreground"
                    )}
                  >
                    {format(weekDates[i], "d")}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Goal rows */}
          {goals.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Target}
                title="No goals for this week"
                description="Add a goal below and check off each day as you complete it."
              />
            </div>
          ) : (
            goals.map((goal) => (
              <PlannerGoalRow
                key={goal._id}
                goal={goal}
                weekDates={weekDates}
                todayKey={todayKey}
                toDateKey={toDateKey}
                gridCols={GRID_COLS}
                onUpdateDay={(day, status) =>
                  updateDay(goal._id, day, status)
                }
                onUpdateTitle={(title) => updateTitle(goal._id, title)}
                onDelete={() => deleteGoal(goal._id)}
              />
            ))
          )}

          {/* Add-goal row */}
          <div className="flex items-center gap-2 border-t bg-muted/30 p-2">
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addGoal();
              }}
              placeholder="Add a goal — e.g. Morning workout"
              className="h-9 flex-1 bg-background"
            />
            <Button size="sm" onClick={addGoal} disabled={!newTitle.trim()}>
              <Plus className="h-4 w-4" />
              Add goal
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
