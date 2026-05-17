"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Flame,
  Check,
  Target,
  ChevronRight,
  Trash2,
} from "lucide-react";
import { cn, toDateKey, formatDate } from "@/lib/utils";
import { useCompassStore } from "@/features/compass/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/empty-state";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  HabitHeatmap,
  HeatmapLegend,
} from "@/features/compass/components/habit-heatmap";

const CATEGORIES = ["study", "health", "finance", "career", "personal"];
const CATEGORY_TONE = {
  study: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  health:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  finance:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  career:
    "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  personal:
    "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
};

export function CompassClient({ initialGoals, initialHeatmap, initialHabits }) {
  const router = useRouter();
  const {
    goals,
    setGoals,
    habits,
    setHabits,
    addHabit,
    heatmapData,
    setHeatmapData,
    toggleHabit,
  } = useCompassStore();

  // Hydrate store from server data on mount.
  React.useEffect(() => {
    setGoals(initialGoals);
    if (initialHabits?.length) {
      const merged = [
        ...new Set([...useCompassStore.getState().habits, ...initialHabits]),
      ];
      setHabits(merged);
    }
    setHeatmapData({ ...initialHeatmap, ...useCompassStore.getState().heatmapData });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const today = toDateKey();
  const todayHabits = heatmapData[today] || {};

  // Aggregate intensity per day = count of habits completed.
  const heatValues = React.useMemo(() => {
    const out = {};
    for (const [date, map] of Object.entries(heatmapData)) {
      out[date] = Object.values(map).filter(Boolean).length;
    }
    return out;
  }, [heatmapData]);

  const maxIntensity = Math.max(habits.length, 1);

  // Current streak: consecutive days (ending today) with ≥1 habit done.
  const streak = React.useMemo(() => {
    let count = 0;
    const d = new Date();
    while (count < 366) {
      const k = toDateKey(d);
      if ((heatValues[k] || 0) > 0) count++;
      else if (k !== today) break;
      else break;
      d.setDate(d.getDate() - 1);
    }
    return count;
  }, [heatValues, today]);

  return (
    <div className="space-y-6">
      {/* Habit tracker */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Today&apos;s Habits</CardTitle>
            <p className="text-sm text-muted-foreground">
              {formatDate(today)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <Flame className="h-3 w-3 text-amber-500" />
              {streak} day streak
            </Badge>
            <AddHabitDialog onAdd={addHabit} />
          </div>
        </CardHeader>
        <CardContent>
          {habits.length === 0 ? (
            <EmptyState
              icon={Flame}
              title="No habits yet"
              description="Add a habit to start building your streak."
            />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {habits.map((habit) => {
                const done = !!todayHabits[habit];
                return (
                  <button
                    key={habit}
                    onClick={() => toggleHabit(habit, today, !done)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                      done
                        ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40"
                        : "hover:bg-accent/60"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-5 w-5 items-center justify-center rounded-md border",
                        done
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : "border-input"
                      )}
                    >
                      {done && <Check className="h-3.5 w-3.5" />}
                    </span>
                    <span
                      className={cn(
                        "flex-1 font-medium",
                        done && "text-emerald-700 dark:text-emerald-300"
                      )}
                    >
                      {habit}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Heatmap */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Consistency · 365 days</CardTitle>
          <HeatmapLegend />
        </CardHeader>
        <CardContent>
          <HabitHeatmap values={heatValues} maxIntensity={maxIntensity} />
        </CardContent>
      </Card>

      {/* Goals */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Goals</h2>
          <AddGoalDialog
            onCreated={(goal) => {
              setGoals([goal, ...useCompassStore.getState().goals]);
              router.refresh();
            }}
          />
        </div>
        {goals.length === 0 ? (
          <EmptyState
            icon={Target}
            title="No goals yet"
            description="Define a goal and break it into milestones to track progress."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {goals.map((goal) => (
              <Link key={goal._id} href={`/compass/${goal._id}`}>
                <Card className="h-full transition-colors hover:border-foreground/30">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                          CATEGORY_TONE[goal.category]
                        )}
                      >
                        {goal.category}
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <p className="mt-2 font-medium">{goal.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {goal.milestones?.length || 0} milestones
                      {goal.targetDate
                        ? ` · due ${formatDate(goal.targetDate)}`
                        : ""}
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                      <Progress value={goal.overallProgress || 0} />
                      <span className="w-9 text-right text-xs font-medium tabular-nums">
                        {goal.overallProgress || 0}%
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AddHabitDialog({ onAdd }) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");

  function submit() {
    if (!name.trim()) return;
    onAdd(name.trim());
    setName("");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="h-4 w-4" />
          Habit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New habit</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="habit-name">Habit name</Label>
          <Input
            id="habit-name"
            placeholder="e.g. Morning Run"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button onClick={submit}>Add habit</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddGoalDialog({ onCreated }) {
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [form, setForm] = React.useState({
    title: "",
    category: "study",
    targetDate: "",
  });
  const [milestones, setMilestones] = React.useState([
    { title: "", unit: "", targetValue: "" },
  ]);

  function reset() {
    setForm({ title: "", category: "study", targetDate: "" });
    setMilestones([{ title: "", unit: "", targetValue: "" }]);
    setError("");
  }

  async function submit() {
    if (!form.title.trim()) {
      setError("Goal title is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/compass/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          category: form.category,
          targetDate: form.targetDate || undefined,
          milestones: milestones
            .filter((m) => m.title.trim())
            .map((m) => ({
              title: m.title.trim(),
              unit: m.unit || undefined,
              targetValue: m.targetValue
                ? Number(m.targetValue)
                : undefined,
            })),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      const goal = await res.json();
      onCreated(goal);
      reset();
      setOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          New goal
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a goal</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="goal-title">Title</Label>
            <Input
              id="goal-title"
              placeholder="e.g. IELTS Preparation"
              value={form.title}
              onChange={(e) =>
                setForm({ ...form, title: e.target.value })
              }
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="goal-cat">Category</Label>
              <select
                id="goal-cat"
                value={form.category}
                onChange={(e) =>
                  setForm({ ...form, category: e.target.value })
                }
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm capitalize"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="goal-date">Target date</Label>
              <Input
                id="goal-date"
                type="date"
                value={form.targetDate}
                onChange={(e) =>
                  setForm({ ...form, targetDate: e.target.value })
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Milestones</Label>
            {milestones.map((m, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  placeholder="Milestone"
                  value={m.title}
                  onChange={(e) => {
                    const next = [...milestones];
                    next[i].title = e.target.value;
                    setMilestones(next);
                  }}
                />
                <Input
                  className="w-20"
                  placeholder="Unit"
                  value={m.unit}
                  onChange={(e) => {
                    const next = [...milestones];
                    next[i].unit = e.target.value;
                    setMilestones(next);
                  }}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setMilestones(
                      milestones.filter((_, idx) => idx !== i)
                    )
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setMilestones([
                  ...milestones,
                  { title: "", unit: "", targetValue: "" },
                ])
              }
            >
              <Plus className="h-4 w-4" />
              Add milestone
            </Button>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Creating…" : "Create goal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
