"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, Plus, Repeat } from "lucide-react";
import { toast } from "sonner";
import { cn, toDateKey } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useBudgetStore } from "../store";
import { CategoryPicker } from "./category-picker";
import { PAYMENT_METHODS, RECURRENCE_FREQUENCIES } from "../constants";

const EMPTY = {
  amount: "",
  categoryId: "",
  date: "",
  note: "",
  paymentMethod: "cash",
  tags: "",
  isRecurring: false,
  frequency: "monthly",
};

/**
 * Primary expense entry point. The fast path is amount → category →
 * save; everything else lives behind "Add details" so logging a
 * typical expense takes three interactions or fewer.
 */
export function AddExpenseForm({ categories }) {
  const addExpense = useBudgetStore((s) => s.addExpense);
  const [form, setForm] = React.useState(EMPTY);
  const [showDetails, setShowDetails] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const amountRef = React.useRef(null);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const canSave = Number(form.amount) > 0 && !!form.categoryId;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSave || saving) return;
    setSaving(true);
    try {
      await addExpense({
        amount: form.amount,
        categoryId: form.categoryId,
        date: form.date || toDateKey(),
        note: form.note.trim() || undefined,
        paymentMethod: form.paymentMethod,
        tags: form.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        isRecurring: form.isRecurring,
        recurrence: form.isRecurring ? { frequency: form.frequency } : undefined,
      });
      toast.success("Expense added.");
      setForm(EMPTY);
      setShowDetails(false);
      amountRef.current?.focus();
    } catch (err) {
      toast.error(err.message || "Could not add expense.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="sm:w-40">
          <Label htmlFor="expense-amount" className="sr-only">
            Amount
          </Label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              NPR
            </span>
            <Input
              ref={amountRef}
              id="expense-amount"
              inputMode="decimal"
              placeholder="0"
              autoFocus
              value={form.amount}
              onChange={(e) => set({ amount: e.target.value })}
              className="h-11 pl-11 text-lg font-semibold tabular-nums"
            />
          </div>
        </div>

        <div className="flex-1">
          <CategoryPicker
            categories={categories}
            value={form.categoryId}
            onChange={(categoryId) => set({ categoryId })}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setShowDetails((s) => !s)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          aria-expanded={showDetails}
        >
          {showDetails ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          Add details
        </button>
        <Button type="submit" size="sm" disabled={!canSave || saving}>
          <Plus className="h-4 w-4" />
          {saving ? "Saving…" : "Add expense"}
        </Button>
      </div>

      {showDetails && (
        <div className="grid gap-3 border-t pt-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="expense-date">Date</Label>
            <Input
              id="expense-date"
              type="date"
              value={form.date || toDateKey()}
              onChange={(e) => set({ date: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="expense-payment">Payment method</Label>
            <Select
              id="expense-payment"
              value={form.paymentMethod}
              onChange={(e) => set({ paymentMethod: e.target.value })}
            >
              {PAYMENT_METHODS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="expense-note">Note</Label>
            <Input
              id="expense-note"
              placeholder="What was this for?"
              value={form.note}
              onChange={(e) => set({ note: e.target.value })}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="expense-tags">Tags (comma-separated)</Label>
            <Input
              id="expense-tags"
              placeholder="work, family"
              value={form.tags}
              onChange={(e) => set({ tags: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-3 sm:col-span-2">
            <button
              type="button"
              role="switch"
              aria-checked={form.isRecurring}
              onClick={() => set({ isRecurring: !form.isRecurring })}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                form.isRecurring
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-input text-muted-foreground hover:bg-accent"
              )}
            >
              <Repeat className="h-3.5 w-3.5" />
              Recurring
            </button>
            {form.isRecurring && (
              <Select
                className="w-36"
                value={form.frequency}
                onChange={(e) => set({ frequency: e.target.value })}
                aria-label="Recurrence frequency"
              >
                {RECURRENCE_FREQUENCIES.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </Select>
            )}
          </div>
        </div>
      )}
    </form>
  );
}
