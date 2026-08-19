"use client";

import * as React from "react";
import { toast } from "sonner";
import { toDateKey } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
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
import { goalTotals } from "../utils";

/** Adds money to a savings goal, dated today by default. */
export function ContributionDialog({ open, onOpenChange, goal }) {
  const addContribution = useBudgetStore((s) => s.addContribution);
  const [form, setForm] = React.useState({
    amount: "",
    date: toDateKey(),
    note: "",
  });
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) setForm({ amount: "", date: toDateKey(), note: "" });
  }, [open]);

  if (!goal) return null;

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const totals = goalTotals(goal);
  const canSave = Number(form.amount) > 0 && !saving;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    try {
      await addContribution(goal._id, form);
      toast.success("Added to your goal.");
      onOpenChange(false);
    } catch (err) {
      toast.error(err.message || "Could not save the contribution.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {goal.icon} {goal.name}
          </DialogTitle>
          <DialogDescription>
            {formatMoney(totals.savedPaisa)} saved of{" "}
            {formatMoney(totals.targetPaisa)} —{" "}
            {formatMoney(totals.remainingPaisa)} to go.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="contribution-amount">Amount</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                NPR
              </span>
              <Input
                id="contribution-amount"
                autoFocus
                inputMode="decimal"
                placeholder="0"
                value={form.amount}
                onChange={(e) => set({ amount: e.target.value })}
                className="h-12 pl-12 text-lg font-semibold tabular-nums"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="contribution-date">Date</Label>
            <Input
              id="contribution-date"
              type="date"
              value={form.date}
              onChange={(e) => set({ date: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="contribution-note">Note</Label>
            <Textarea
              id="contribution-note"
              rows={2}
              placeholder="Optional"
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
              {saving ? "Saving…" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
