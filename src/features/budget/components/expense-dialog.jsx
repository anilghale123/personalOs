"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, Repeat } from "lucide-react";
import { toast } from "sonner";
import { cn, toDateKey } from "@/lib/utils";
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
import { categoryOptions } from "../utils";
import { PAYMENT_METHODS, RECURRENCE_FREQUENCIES } from "../constants";

/** A blank draft — the date starts on today so the common case needs no input. */
function emptyDraft(defaultCategoryId = "") {
  return {
    amount: "",
    categoryId: defaultCategoryId,
    date: toDateKey(),
    note: "",
    paymentMethod: "cash",
    tags: "",
    isRecurring: false,
    frequency: "monthly",
  };
}

function draftFromExpense(expense) {
  return {
    amount: String(expense.amountPaisa / 100),
    categoryId: String(expense.categoryId),
    date: expense.date || toDateKey(),
    note: expense.note || "",
    paymentMethod: expense.paymentMethod || "cash",
    tags: (expense.tags || []).join(", "),
    isRecurring: Boolean(expense.isRecurring),
    frequency: expense.recurrence?.frequency || "monthly",
  };
}

/**
 * The single place expenses are created and edited. Both the "Add
 * expense" button and a row edit action open this same modal, so the
 * list page stays a clean record of spending rather than a form.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {(open: boolean) => void} props.onOpenChange
 * @param {Array} props.categories
 * @param {object} [props.expense] editing an existing row when provided
 */
export function ExpenseDialog({ open, onOpenChange, categories, expense }) {
  const addExpense = useBudgetStore((s) => s.addExpense);
  const updateExpense = useBudgetStore((s) => s.updateExpense);
  const isEdit = Boolean(expense);

  const options = React.useMemo(
    () => categoryOptions(categories, expense?.categoryId),
    [categories, expense]
  );

  const [form, setForm] = React.useState(emptyDraft());
  const [showMore, setShowMore] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  // Reset every time the modal opens so a cancelled edit never leaks
  // into the next expense.
  React.useEffect(() => {
    if (!open) return;
    setForm(expense ? draftFromExpense(expense) : emptyDraft(options[0]?._id || ""));
    setShowMore(Boolean(expense?.isRecurring) || Boolean(expense?.tags?.length));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, expense]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const amountPaisa = Math.round((Number(form.amount) || 0) * 100);
  const canSave = amountPaisa > 0 && !!form.categoryId && !saving;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);

    const payload = {
      amount: form.amount,
      categoryId: form.categoryId,
      date: form.date || toDateKey(),
      note: form.note.trim(),
      paymentMethod: form.paymentMethod,
      tags: form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      isRecurring: form.isRecurring,
      recurrence: form.isRecurring ? { frequency: form.frequency } : undefined,
    };

    try {
      if (isEdit) {
        await updateExpense(expense._id, payload);
        toast.success("Expense updated.");
      } else {
        await addExpense({ ...payload, note: payload.note || undefined });
        toast.success("Expense added.");
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err.message || "Could not save the expense.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit expense" : "Add expense"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the details of this record."
              : "Amount and category are all you need — the rest is optional."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="expense-amount">Amount</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                NPR
              </span>
              <Input
                id="expense-amount"
                inputMode="decimal"
                placeholder="0"
                autoFocus
                value={form.amount}
                onChange={(e) => set({ amount: e.target.value })}
                className="h-12 pl-12 text-lg font-semibold tabular-nums"
              />
            </div>
            {amountPaisa > 0 && (
              <p className="text-xs text-muted-foreground">
                {formatMoney(amountPaisa)}
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="expense-category">Category</Label>
              <Select
                id="expense-category"
                value={form.categoryId}
                onChange={(e) => set({ categoryId: e.target.value })}
                required
              >
                <option value="" disabled>
                  Select a category
                </option>
                {options.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.depth ? "— " : ""}
                    {c.icon} {c.name}
                    {c.isArchived ? " (archived)" : ""}
                  </option>
                ))}
              </Select>
              {options.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No categories yet — add one in the Categories tab first.
                </p>
              )}
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

            <div className="space-y-1.5">
              <Label htmlFor="expense-date">Date</Label>
              <Input
                id="expense-date"
                type="date"
                value={form.date}
                onChange={(e) => set({ date: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="expense-note">Note</Label>
            <Textarea
              id="expense-note"
              rows={3}
              placeholder="What was this for?"
              value={form.note}
              onChange={(e) => set({ note: e.target.value })}
              className="min-h-[72px] resize-none"
            />
          </div>

          <div className="space-y-3 border-t pt-3">
            <button
              type="button"
              onClick={() => setShowMore((s) => !s)}
              aria-expanded={showMore}
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              {showMore ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
              Tags and recurring
            </button>

            {showMore && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="expense-tags">Tags (comma-separated)</Label>
                  <Input
                    id="expense-tags"
                    placeholder="work, family"
                    value={form.tags}
                    onChange={(e) => set({ tags: e.target.value })}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-3">
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
              {saving ? "Saving…" : isEdit ? "Save changes" : "Add expense"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
