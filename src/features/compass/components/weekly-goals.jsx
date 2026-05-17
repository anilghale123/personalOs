"use client";

import * as React from "react";
import { Plus, CalendarRange, Trash2, Check } from "lucide-react";
import { toast } from "sonner";
import { cn, toDateKey } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

const CATEGORIES = ["study", "health", "finance", "work", "personal"];
const CATEGORY_TONE = {
  study: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  health: "bg-green-500/10 text-green-700 dark:text-green-400",
  finance: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  work: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
  personal: "bg-pink-500/10 text-pink-700 dark:text-pink-400",
};

/** Completion percentage of a weekly goal's checklist. */
function completionOf(goal) {
  if (!goal.checklistItems?.length) return 0;
  const done = goal.checklistItems.filter((i) => i.isComplete).length;
  return Math.round((done / goal.checklistItems.length) * 100);
}

export function WeeklyGoals({ initialGoals, weekLabel }) {
  const [goals, setGoals] = React.useState(initialGoals || []);

  // Toggle a checklist item with optimistic update + rollback.
  async function toggleItem(goalId, itemId, checked) {
    const apply = (value) =>
      setGoals((prev) =>
        prev.map((g) =>
          g._id !== goalId
            ? g
            : {
                ...g,
                checklistItems: g.checklistItems.map((item) =>
                  item._id !== itemId
                    ? item
                    : { ...item, isComplete: value }
                ),
              }
        )
      );

    apply(checked);
    try {
      const res = await fetch("/api/weekly-goals/toggle-item", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goalId,
          itemId,
          completed: checked,
          date: toDateKey(),
        }),
      });
      if (!res.ok) throw new Error();
    } catch {
      apply(!checked); // rollback
      toast.error("Could not save — please try again.");
    }
  }

  const totalItems = goals.flatMap((g) => g.checklistItems || []).length;
  const doneItems = goals
    .flatMap((g) => g.checklistItems || [])
    .filter((i) => i.isComplete).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">This Week&apos;s Goals</h2>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarRange className="h-3.5 w-3.5" />
            {weekLabel}
            {totalItems > 0 && (
              <span>
                · {doneItems}/{totalItems} tasks done
              </span>
            )}
          </p>
        </div>
        <AddWeeklyGoalDialog
          onCreated={(goal) => setGoals((prev) => [goal, ...prev])}
        />
      </div>

      {goals.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="No goals for this week"
          description="Set a few weekly goals with checklist items to focus your week."
        />
      ) : (
        <div className="space-y-3">
          {goals.map((goal) => {
            const pct = completionOf(goal);
            return (
              <Card key={goal._id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <CardTitle className="flex-1 text-base font-medium">
                      {goal.title}
                    </CardTitle>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                        CATEGORY_TONE[goal.category]
                      )}
                    >
                      {goal.category}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Progress value={pct} className="h-1.5 flex-1" />
                    <span className="w-9 text-right text-xs font-medium tabular-nums text-muted-foreground">
                      {pct}%
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-1 pt-0">
                  {goal.checklistItems.map((item) => (
                    <button
                      key={item._id}
                      onClick={() =>
                        toggleItem(goal._id, item._id, !item.isComplete)
                      }
                      className="-mx-2 flex w-full items-start gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/50"
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                          item.isComplete
                            ? "border-emerald-500 bg-emerald-500 text-white"
                            : "border-input"
                        )}
                      >
                        {item.isComplete && (
                          <Check className="h-3 w-3" />
                        )}
                      </span>
                      <span
                        className={cn(
                          "text-sm leading-snug",
                          item.isComplete
                            ? "text-muted-foreground line-through"
                            : "text-foreground"
                        )}
                      >
                        {item.text}
                      </span>
                    </button>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AddWeeklyGoalDialog({ onCreated }) {
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [category, setCategory] = React.useState("personal");
  const [items, setItems] = React.useState([""]);

  function reset() {
    setTitle("");
    setCategory("personal");
    setItems([""]);
  }

  async function submit() {
    const validItems = items.filter((i) => i.trim());
    if (!title.trim()) return toast.error("Goal title is required.");
    if (!validItems.length)
      return toast.error("Add at least one checklist item.");

    setSaving(true);
    try {
      const res = await fetch("/api/weekly-goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, category, items: validItems }),
      });
      if (!res.ok) {
        throw new Error((await res.json()).error || "Failed");
      }
      const created = await res.json();
      onCreated(created);
      toast.success("Weekly goal added!");
      reset();
      setOpen(false);
    } catch (err) {
      toast.error(err.message);
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
          New weekly goal
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add weekly goal</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="wg-title">Goal title</Label>
            <Input
              id="wg-title"
              placeholder="e.g. IELTS Speaking Practice"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wg-cat">Category</Label>
            <select
              id="wg-cat"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm capitalize"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Checklist items</Label>
            {items.map((item, idx) => (
              <div key={idx} className="flex gap-2">
                <Input
                  placeholder={`Task ${idx + 1}`}
                  value={item}
                  onChange={(e) => {
                    const next = [...items];
                    next[idx] = e.target.value;
                    setItems(next);
                  }}
                />
                {items.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() =>
                      setItems(items.filter((_, i) => i !== idx))
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setItems([...items, ""])}
            >
              <Plus className="h-3.5 w-3.5" />
              Add item
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Create goal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
