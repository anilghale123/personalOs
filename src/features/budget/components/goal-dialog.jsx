"use client";

import * as React from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useBudgetStore } from "../store";
import { GOAL_ICONS } from "../constants";

const EMPTY = {
  name: "",
  icon: "🎯",
  target: "",
  targetDate: "",
  note: "",
};

function draftFromGoal(goal) {
  return {
    name: goal.name || "",
    icon: goal.icon || "🎯",
    target: String(goal.targetPaisa / 100),
    targetDate: goal.targetDate || "",
    note: goal.note || "",
  };
}

/** Create or edit a savings goal — the thing the money is actually for. */
export function GoalDialog({ open, onOpenChange, goal }) {
  const addFinancialGoal = useBudgetStore((s) => s.addFinancialGoal);
  const updateFinancialGoal = useBudgetStore((s) => s.updateFinancialGoal);
  const isEdit = Boolean(goal);

  const [form, setForm] = React.useState(EMPTY);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) setForm(goal ? draftFromGoal(goal) : EMPTY);
  }, [open, goal]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const canSave = form.name.trim() && Number(form.target) > 0 && !saving;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    const payload = {
      name: form.name,
      icon: form.icon,
      target: form.target,
      targetDate: form.targetDate,
      note: form.note,
    };
    try {
      if (isEdit) {
        await updateFinancialGoal(goal._id, payload);
        toast.success("Goal updated.");
      } else {
        await addFinancialGoal(payload);
        toast.success("Goal created.");
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err.message || "Could not save the goal.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit goal" : "New savings goal"}</DialogTitle>
          <DialogDescription>
            Name what the savings are for, then add to it whenever you put money aside.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="goal-name">Goal</Label>
            <Input
              id="goal-name"
              autoFocus
              placeholder="Emergency fund"
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Icon</Label>
            <div className="flex flex-wrap gap-1.5">
              {GOAL_ICONS.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => set({ icon })}
                  aria-pressed={form.icon === icon}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg border text-lg transition-colors",
                    form.icon === icon
                      ? "border-primary bg-primary/10"
                      : "border-input hover:bg-accent"
                  )}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="goal-target">Target amount</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  NPR
                </span>
                <Input
                  id="goal-target"
                  inputMode="decimal"
                  placeholder="0"
                  value={form.target}
                  onChange={(e) => set({ target: e.target.value })}
                  className="pl-11 tabular-nums"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="goal-date">Target date</Label>
              <Input
                id="goal-date"
                type="date"
                value={form.targetDate}
                onChange={(e) => set({ targetDate: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="goal-note">Note</Label>
            <Textarea
              id="goal-note"
              rows={2}
              placeholder="Why this matters"
              value={form.note}
              onChange={(e) => set({ note: e.target.value })}
              className="min-h-[60px] resize-none"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSave}>
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create goal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
