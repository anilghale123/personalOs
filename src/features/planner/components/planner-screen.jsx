"use client";

import * as React from "react";
import { addDays, parseISO, format } from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  CalendarRange,
  CalendarDays,
  Plus,
  Search,
  Target,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn, toDateKey } from "@/lib/utils";
import { weekStartKey } from "@/lib/week";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/empty-state";
import { DAYS, GOAL_FILTERS, goalTally } from "@/features/planner/utils";
import { PlannerGoalRow } from "./planner-goal-row";
import { PlannerCalendar } from "./planner-calendar";
import { PlannerHistory } from "./planner-history";

const GRID_COLS = "grid-cols-[minmax(150px,1.8fr)_repeat(7,minmax(0,1fr))]";
const JSON_HEADERS = { "Content-Type": "application/json" };

export function PlannerScreen({ initialWeekStart, initialGoals }) {
  const [weekStart, setWeekStart] = React.useState(initialWeekStart);
  const [goals, setGoals] = React.useState(initialGoals || []);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(0);
  const [newTitle, setNewTitle] = React.useState("");
  const [view, setView] = React.useState("week");
  const [showCalendar, setShowCalendar] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState("all");
  // Bumped after every edit so the calendar and history refetch their tallies.
  const [refreshKey, setRefreshKey] = React.useState(0);
  // Guards against a slow fetch overwriting the grid after navigation.
  const weekRef = React.useRef(initialWeekStart);
  // Always-current goals for the stable callbacks below.
  const goalsRef = React.useRef(goals);
  goalsRef.current = goals;
  // In-flight mutations per goal, so a slow response can never overwrite
  // a newer optimistic edit (the rapid check/uncheck glitch).
  const pendingRef = React.useRef(new Map());
  const refreshTimer = React.useRef(null);

  // Toggles often come in bursts; the calendar/history refetch once the
  // burst settles instead of on every single tap.
  const scheduleRefresh = React.useCallback(() => {
    clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => setRefreshKey((n) => n + 1), 600);
  }, []);

  React.useEffect(() => () => clearTimeout(refreshTimer.current), []);

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

  /** Open a week from the calendar or history and show its grid. */
  function openWeek(ws) {
    setView("week");
    if (ws !== weekStart) loadWeek(ws);
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
      setRefreshKey((n) => n + 1);
    } catch (err) {
      toast.error(err.message || "Could not add goal.");
    } finally {
      setSaving((n) => n - 1);
    }
  }

  /**
   * Optimistically patch a goal. The server's copy is applied only when
   * no newer edit to the same goal is still in flight; on failure just
   * the touched fields roll back, then the week quietly re-syncs.
   */
  const patchGoal = React.useCallback(
    async (goalId, body, optimistic, rollback) => {
      setGoals((g) => g.map((x) => (x._id === goalId ? optimistic(x) : x)));
      pendingRef.current.set(goalId, (pendingRef.current.get(goalId) || 0) + 1);
      setSaving((n) => n + 1);
      try {
        const res = await fetch(`/api/planner/${goalId}`, {
          method: "PATCH",
          headers: JSON_HEADERS,
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error();
        const updated = await res.json();
        if (pendingRef.current.get(goalId) === 1) {
          setGoals((g) => g.map((x) => (x._id === goalId ? updated : x)));
        }
        scheduleRefresh();
      } catch {
        setGoals((g) => g.map((x) => (x._id === goalId ? rollback(x) : x)));
        toast.error("Could not save — please try again.");
        loadWeek(weekRef.current);
      } finally {
        pendingRef.current.set(goalId, (pendingRef.current.get(goalId) || 1) - 1);
        setSaving((n) => n - 1);
      }
    },
    [loadWeek, scheduleRefresh]
  );

  const updateDay = React.useCallback(
    (goalId, day, status) => {
      const prev =
        goalsRef.current.find((x) => x._id === goalId)?.days?.[day] || "pending";
      patchGoal(
        goalId,
        { day, status },
        (g) => ({ ...g, days: { ...g.days, [day]: status } }),
        (g) => ({ ...g, days: { ...g.days, [day]: prev } })
      );
    },
    [patchGoal]
  );

  const updateTitle = React.useCallback(
    (goalId, title) => {
      const prev = goalsRef.current.find((x) => x._id === goalId)?.title || "";
      patchGoal(
        goalId,
        { title },
        (g) => ({ ...g, title }),
        (g) => ({ ...g, title: prev })
      );
    },
    [patchGoal]
  );

  const deleteGoal = React.useCallback(
    async (goalId) => {
      const before = goalsRef.current;
      setGoals((g) => g.filter((x) => x._id !== goalId));
      try {
        const res = await fetch(`/api/planner/${goalId}`, { method: "DELETE" });
        if (!res.ok) throw new Error();
        scheduleRefresh();
      } catch {
        setGoals(before); // rollback
        toast.error("Could not delete goal.");
      }
    },
    [scheduleRefresh]
  );

  const weekDates = React.useMemo(
    () => DAYS.map((_, i) => addDays(parseISO(weekStart), i)),
    [weekStart]
  );
  const todayKey = toDateKey();
  const start = parseISO(weekStart);
  const label = `${format(start, "MMM d")} – ${format(
    addDays(start, 6),
    "MMM d, yyyy"
  )}`;
  const currentWeek = weekStartKey();
  const isCurrentWeek = weekStart === currentWeek;
  const isPastWeek = weekStart < currentWeek;

  const totalDone = goals.reduce((sum, g) => sum + goalTally(g).done, 0);
  const overall = goals.length
    ? Math.round((totalDone / (goals.length * DAYS.length)) * 100)
    : 0;

  // Filter counts come from the search-matched set, so the chips agree
  // with what the grid can actually show.
  const q = query.trim().toLowerCase();
  const searched = q
    ? goals.filter((g) => g.title.toLowerCase().includes(q))
    : goals;
  const counts = Object.fromEntries(
    GOAL_FILTERS.map((f) => [
      f.id,
      searched.filter((g) => f.match(goalTally(g))).length,
    ])
  );
  const activeFilter =
    GOAL_FILTERS.find((f) => f.id === filter) || GOAL_FILTERS[0];
  const visibleGoals = searched.filter((g) => activeFilter.match(goalTally(g)));
  const isFiltered = filter !== "all" || q.length > 0;

  return (
    <Tabs value={view} onValueChange={setView} className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-base font-semibold">
            <CalendarRange className="h-4 w-4 text-muted-foreground" />
            {view === "history" ? "Week history" : label}
          </h2>
          <p className="text-xs text-muted-foreground">
            {view === "history"
              ? "Look back at how your past weeks went — pick one to reopen it."
              : saving > 0
              ? "Saving…"
              : goals.length > 0
              ? `${overall}% of goals completed${
                  isCurrentWeek ? " this week" : isPastWeek ? " that week" : ""
                }`
              : "Add goals below, then tap a day to mark it done."}
          </p>
        </div>
        <TabsList>
          <TabsTrigger value="week">Planner</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="week" className="mt-0 space-y-3">
        {/* Week navigation */}
        <div className="flex flex-wrap items-center gap-1">
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
            onClick={() => loadWeek(currentWeek)}
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
          <Button
            variant={showCalendar ? "secondary" : "outline"}
            size="sm"
            className="ml-auto"
            onClick={() => setShowCalendar((s) => !s)}
            aria-expanded={showCalendar}
          >
            <CalendarDays className="h-4 w-4" />
            {showCalendar ? "Hide calendar" : "Jump to week"}
          </Button>
        </div>

        {showCalendar && (
          <PlannerCalendar
            weekStart={weekStart}
            onSelect={(ws) => {
              if (ws !== weekStart) loadWeek(ws);
            }}
            refreshKey={refreshKey}
          />
        )}

        {/* Filters */}
        {goals.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-56">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search goals…"
                className="h-8 pl-8 pr-8 text-sm"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {GOAL_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                    filter === f.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent"
                  )}
                >
                  {f.label}
                  <span className="ml-1 tabular-nums opacity-70">
                    {counts[f.id]}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Planner grid */}
        <div className="overflow-x-auto rounded-2xl bg-card elev-sm">
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
            ) : visibleGoals.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-8 text-center">
                <p className="text-sm text-muted-foreground">
                  No goals match this filter.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setFilter("all");
                    setQuery("");
                  }}
                >
                  Clear filters
                </Button>
              </div>
            ) : (
              visibleGoals.map((goal) => (
                <PlannerGoalRow
                  key={goal._id}
                  goal={goal}
                  weekDates={weekDates}
                  todayKey={todayKey}
                  gridCols={GRID_COLS}
                  onUpdateDay={updateDay}
                  onUpdateTitle={updateTitle}
                  onDelete={deleteGoal}
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
                placeholder={
                  isPastWeek
                    ? "Add a goal to this past week"
                    : "Add a goal — e.g. Morning workout"
                }
                className="h-9 flex-1 bg-background"
              />
              <Button size="sm" onClick={addGoal} disabled={!newTitle.trim()}>
                <Plus className="h-4 w-4" />
                Add goal
              </Button>
            </div>
          </div>
        </div>

        {isFiltered && visibleGoals.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Showing {visibleGoals.length} of {goals.length} goals.
          </p>
        )}
      </TabsContent>

      <TabsContent value="history" className="mt-0">
        <PlannerHistory
          activeWeekStart={weekStart}
          onOpenWeek={openWeek}
          refreshKey={refreshKey}
        />
      </TabsContent>
    </Tabs>
  );
}
