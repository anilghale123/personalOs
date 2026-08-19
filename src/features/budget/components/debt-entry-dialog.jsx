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
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useBudgetStore } from "../store";
import { DEBT_ENTRY_TYPES } from "../constants";
import { debtTotals } from "../utils";

/**
 * Logs one movement on a debt: money paid back, or more borrowed on the
 * same loan. Defaults to a payment dated today.
 */
export function DebtEntryDialog({ open, onOpenChange, debt, defaultType = "payment" }) {
  const addDebtEntry = useBudgetStore((s) => s.addDebtEntry);
  const [form, setForm] = React.useState({
    type: defaultType,
    amount: "",
    date: toDateKey(),
    note: "",
  });
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setForm({ type: defaultType, amount: "", date: toDateKey(), note: "" });
    }
  }, [open, defaultType]);

  if (!debt) return null;

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const totals = debtTotals(debt);
  const canSave = Number(form.amount) > 0 && !saving;
  const typeMeta = DEBT_ENTRY_TYPES.find((t) => t.id === form.type);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    try {
      await addDebtEntry(debt._id, form);
      toast.success(
        form.type === "payment" ? "Payment recorded." : "Extra borrowing recorded."
      );
      onOpenChange(false);
    } catch (err) {
      toast.error(err.message || "Could not save the entry.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{debt.name}</DialogTitle>
          <DialogDescription>
            {formatMoney(totals.remainingPaisa)} outstanding of{" "}
            {formatMoney(totals.totalPaisa)}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="entry-type">Entry</Label>
            <Select
              id="entry-type"
              value={form.type}
              onChange={(e) => set({ type: e.target.value })}
            >
              {DEBT_ENTRY_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </Select>
            {typeMeta && (
              <p className="text-xs text-muted-foreground">{typeMeta.hint}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="entry-amount">Amount</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                NPR
              </span>
              <Input
                id="entry-amount"
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
            <Label htmlFor="entry-date">Date</Label>
            <Input
              id="entry-date"
              type="date"
              value={form.date}
              onChange={(e) => set({ date: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="entry-note">Note</Label>
            <Textarea
              id="entry-note"
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
              {saving ? "Saving…" : "Record"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
