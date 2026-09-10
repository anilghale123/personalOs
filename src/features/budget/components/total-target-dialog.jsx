"use client";

import * as React from "react";
import { toast } from "sonner";
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
import { formatMoney, toMinorUnits } from "@/lib/money";
import { useBudgetStore } from "../store";

/**
 * The total target, edited where it is read.
 *
 * Nothing stores a "total" — it is the sum of what every goal is aiming
 * for — so the honest way to make the stat card editable is to edit the
 * numbers behind it, with the running sum updating as you type.
 */
export function TotalTargetDialog({ open, onOpenChange, goals = [] }) {
  const updateFinancialGoal = useBudgetStore((s) => s.updateFinancialGoal);
  const [drafts, setDrafts] = React.useState({});
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setDrafts(
      Object.fromEntries(
        goals.map((g) => [g._id, String((Number(g.targetPaisa) || 0) / 100)])
      )
    );
  }, [open, goals]);

  const rows = goals.map((goal) => {
    const raw = drafts[goal._id] ?? "";
    const paisa = toMinorUnits(raw);
    const invalid = raw.trim() === "" || !Number.isFinite(Number(raw)) || paisa <= 0;
    return {
      goal,
      raw,
      paisa,
      invalid,
      changed: !invalid && paisa !== (Number(goal.targetPaisa) || 0),
    };
  });

  const totalPaisa = rows.reduce((sum, r) => sum + (r.invalid ? 0 : r.paisa), 0);
  const changed = rows.filter((r) => r.changed);
  const canSave = !rows.some((r) => r.invalid) && changed.length > 0 && !saving;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    try {
      // One request per changed goal — the API patches a goal at a time,
      // and sequential keeps the store's list from racing itself.
      for (const row of changed) {
        await updateFinancialGoal(row.goal._id, { target: row.raw });
      }
      toast.success(
        changed.length === 1
          ? "Target updated."
          : `${changed.length} targets updated.`
      );
      onOpenChange(false);
    } catch (err) {
      toast.error(err.message || "Could not save the targets.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Total target</DialogTitle>
          <DialogDescription>
            The total is what your goals add up to. Change any of them here
            and the total follows.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="max-h-[46vh] space-y-2.5 overflow-y-auto pr-0.5">
            {rows.map(({ goal, raw, invalid }) => (
              <div key={goal._id} className="flex items-center gap-3">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg"
                  style={{ background: `${goal.color || "#16a34a"}1f` }}
                  aria-hidden="true"
                >
                  {goal.icon || "🎯"}
                </span>
                <label
                  htmlFor={`total-target-${goal._id}`}
                  className="min-w-0 flex-1 truncate text-sm"
                >
                  {goal.name}
                </label>
                <div className="relative w-36 shrink-0">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    NPR
                  </span>
                  <Input
                    id={`total-target-${goal._id}`}
                    inputMode="decimal"
                    placeholder="0"
                    aria-invalid={invalid || undefined}
                    value={raw}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [goal._id]: e.target.value }))
                    }
                    className="pl-11 tabular-nums"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-baseline justify-between border-t pt-3">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Total target
            </span>
            <span className="text-lg font-semibold tabular-nums">
              {formatMoney(totalPaisa)}
            </span>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSave}>
              {saving ? "Saving…" : "Save targets"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
