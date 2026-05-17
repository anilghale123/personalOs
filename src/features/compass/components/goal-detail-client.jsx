"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Check, Plus, Trash2 } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

export function GoalDetailClient({ initialGoal }) {
  const [goal, setGoal] = React.useState(initialGoal);
  const [saving, setSaving] = React.useState(false);

  async function persist(patch) {
    setSaving(true);
    try {
      const res = await fetch("/api/compass/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _id: goal._id, ...patch }),
      });
      if (res.ok) setGoal(await res.json());
    } finally {
      setSaving(false);
    }
  }

  function toggleMilestone(index) {
    const milestones = goal.milestones.map((m, i) =>
      i === index ? { ...m, isComplete: !m.isComplete } : m
    );
    setGoal({ ...goal, milestones }); // optimistic
    persist({ milestones });
  }

  function addMilestone(title) {
    const milestones = [
      ...goal.milestones,
      { title, isComplete: false, currentValue: 0 },
    ];
    setGoal({ ...goal, milestones });
    persist({ milestones });
  }

  function removeMilestone(index) {
    const milestones = goal.milestones.filter((_, i) => i !== index);
    setGoal({ ...goal, milestones });
    persist({ milestones });
  }

  function updateSubScore(index, current) {
    const subScores = goal.subScores.map((s, i) =>
      i === index ? { ...s, current } : s
    );
    setGoal({ ...goal, subScores });
    persist({ subScores });
  }

  const completed = goal.milestones.filter((m) => m.isComplete).length;

  return (
    <div className="space-y-6">
      <Link
        href="/goals"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Goals
      </Link>

      <div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="capitalize">
            {goal.category}
          </Badge>
          {goal.targetDate && (
            <span className="text-xs text-muted-foreground">
              Target · {formatDate(goal.targetDate)}
            </span>
          )}
          {saving && (
            <span className="text-xs text-muted-foreground">Saving…</span>
          )}
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {goal.title}
        </h1>
        <div className="mt-3 flex items-center gap-3">
          <Progress value={goal.overallProgress || 0} className="max-w-xs" />
          <span className="text-sm font-medium tabular-nums">
            {goal.overallProgress || 0}%
          </span>
          <span className="text-sm text-muted-foreground">
            {completed}/{goal.milestones.length} milestones
          </span>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Milestones</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {goal.milestones.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No milestones yet.
            </p>
          )}
          {goal.milestones.map((m, i) => (
            <div
              key={i}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-3 py-2.5",
                m.isComplete &&
                  "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40"
              )}
            >
              <button
                onClick={() => toggleMilestone(i)}
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-md border",
                  m.isComplete
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : "border-input"
                )}
              >
                {m.isComplete && <Check className="h-3.5 w-3.5" />}
              </button>
              <span
                className={cn(
                  "flex-1 text-sm",
                  m.isComplete &&
                    "text-muted-foreground line-through"
                )}
              >
                {m.title}
                {m.unit ? (
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    ({m.unit})
                  </span>
                ) : null}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeMilestone(i)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <AddMilestoneRow onAdd={addMilestone} />
        </CardContent>
      </Card>

      {goal.subScores?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Band Scores</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {goal.subScores.map((s, i) => (
              <div key={i} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{s.label}</span>
                  <span className="text-muted-foreground">
                    {s.current ?? 0} / {s.target}
                  </span>
                </div>
                <Progress
                  value={
                    s.target
                      ? Math.min(
                          ((s.current || 0) / s.target) * 100,
                          100
                        )
                      : 0
                  }
                />
                <Input
                  type="number"
                  step="0.5"
                  value={s.current ?? ""}
                  onChange={(e) =>
                    updateSubScore(i, Number(e.target.value))
                  }
                  className="h-8"
                />
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AddMilestoneRow({ onAdd }) {
  const [value, setValue] = React.useState("");
  function submit() {
    if (!value.trim()) return;
    onAdd(value.trim());
    setValue("");
  }
  return (
    <div className="flex gap-2 pt-1">
      <Input
        placeholder="Add a milestone…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
      <Button variant="outline" onClick={submit}>
        <Plus className="h-4 w-4" />
        Add
      </Button>
    </div>
  );
}
