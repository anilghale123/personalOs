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
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useBudgetStore } from "../store";
import { DEBT_KINDS } from "../constants";

const EMPTY = {
  name: "",
  kind: "owe",
  counterparty: "",
  principal: "",
  interestRate: "",
  dueDate: "",
  note: "",
};

function draftFromDebt(debt) {
  return {
    name: debt.name || "",
    kind: debt.kind || "owe",
    counterparty: debt.counterparty || "",
    principal: String(debt.principalPaisa / 100),
    interestRate: debt.interestRate ? String(debt.interestRate) : "",
    dueDate: debt.dueDate || "",
    note: debt.note || "",
  };
}

/** Create or edit a debt. The original amount is captured once here; every
 *  repayment afterwards is a ledger entry rather than an edit to this number. */
export function DebtDialog({ open, onOpenChange, debt }) {
  const addDebt = useBudgetStore((s) => s.addDebt);
  const updateDebt = useBudgetStore((s) => s.updateDebt);
  const isEdit = Boolean(debt);

  const [form, setForm] = React.useState(EMPTY);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) setForm(debt ? draftFromDebt(debt) : EMPTY);
  }, [open, debt]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const canSave = form.name.trim() && Number(form.principal) > 0 && !saving;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    const payload = {
      name: form.name,
      kind: form.kind,
      counterparty: form.counterparty,
      principal: form.principal,
      interestRate: form.interestRate,
      dueDate: form.dueDate,
      note: form.note,
    };
    try {
      if (isEdit) {
        await updateDebt(debt._id, payload);
        toast.success("Debt updated.");
      } else {
        await addDebt(payload);
        toast.success("Debt added.");
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err.message || "Could not save the debt.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit debt" : "Add debt"}</DialogTitle>
          <DialogDescription>
            Record the original amount — payments are logged separately so you
            always see how much is left.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="debt-name">Name</Label>
            <Input
              id="debt-name"
              autoFocus
              placeholder="Bike loan"
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="debt-kind">Type</Label>
              <Select
                id="debt-kind"
                value={form.kind}
                onChange={(e) => set({ kind: e.target.value })}
              >
                {DEBT_KINDS.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="debt-principal">Original amount</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  NPR
                </span>
                <Input
                  id="debt-principal"
                  inputMode="decimal"
                  placeholder="0"
                  value={form.principal}
                  onChange={(e) => set({ principal: e.target.value })}
                  className="pl-11 tabular-nums"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="debt-counterparty">
                {form.kind === "owe" ? "Lender" : "Borrower"}
              </Label>
              <Input
                id="debt-counterparty"
                placeholder="Optional"
                value={form.counterparty}
                onChange={(e) => set({ counterparty: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="debt-due">Due date</Label>
              <Input
                id="debt-due"
                type="date"
                value={form.dueDate}
                onChange={(e) => set({ dueDate: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="debt-interest">Interest rate (% a year)</Label>
              <Input
                id="debt-interest"
                inputMode="decimal"
                placeholder="0"
                value={form.interestRate}
                onChange={(e) => set({ interestRate: e.target.value })}
                className="tabular-nums"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="debt-note">Note</Label>
            <Textarea
              id="debt-note"
              rows={2}
              placeholder="Anything worth remembering about this debt"
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
              {saving ? "Saving…" : isEdit ? "Save changes" : "Add debt"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
