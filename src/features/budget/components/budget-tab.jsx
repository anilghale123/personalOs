"use client";

import * as React from "react";
import { Check, Pencil, Plus, Trash2, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { useBudgetStore } from "../store";
import { BUDGET_PERIODS } from "../constants";
import { budgetPeriodLabel, categoryMap, categoryOptions } from "../utils";
import { BudgetAlert } from "./budget-alert";
import { BudgetMeter } from "./budget-meter";

/** Inline amount editor shared by the total and per-category budget rows. */
function AmountEditor({ initial, onSave, onCancel, label }) {
  const [value, setValue] = React.useState(initial);
  const [saving, setSaving] = React.useState(false);

  async function commit() {
    setSaving(true);
    try {
      await onSave(value);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <div className="relative w-40">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          NPR
        </span>
        <Input
          autoFocus
          inputMode="decimal"
          aria-label={label}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") onCancel();
          }}
          className="h-8 pl-10 tabular-nums"
        />
      </div>
      <button
        onClick={commit}
        disabled={saving}
        aria-label="Save budget"
        className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
      >
        <Check className="h-4 w-4" />
      </button>
      <button
        onClick={onCancel}
        aria-label="Cancel"
        className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Headline card — the one number most people mean by "my budget". */
function TotalBudgetCard({ summary, periodLabel, onSave }) {
  const [editing, setEditing] = React.useState(false);
  const hasBudget = summary.totalBudgetPaisa > 0;

  async function save(value) {
    try {
      await onSave({ scope: "total", amount: value });
      setEditing(false);
      toast.success(Number(value) > 0 ? "Budget saved." : "Budget cleared.");
    } catch (err) {
      toast.error(err.message || "Could not save the budget.");
    }
  }

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Total budget
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{periodLabel}</p>
        </div>
        {editing ? (
          <AmountEditor
            label="Total budget amount"
            initial={hasBudget ? String(summary.totalBudgetPaisa / 100) : ""}
            onSave={save}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <div className="flex items-center gap-2">
            {summary.totalCarried && hasBudget && (
              <Badge variant="secondary" title="Carried forward from the previous period">
                Carried over
              </Badge>
            )}
            <Button
              variant={hasBudget ? "outline" : "default"}
              size="sm"
              onClick={() => setEditing(true)}
            >
              {hasBudget ? (
                <>
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" />
                  Set budget
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {hasBudget ? (
        <div className="mt-4 space-y-3">
          <p className="text-3xl font-semibold tabular-nums">
            {formatMoney(summary.spentPaisa)}
            <span className="ml-2 text-base font-normal text-muted-foreground">
              spent
            </span>
          </p>
          <BudgetMeter
            size="large"
            spentPaisa={summary.spentPaisa}
            budgetPaisa={summary.totalBudgetPaisa}
          />
        </div>
      ) : (
        <div className="mt-4">
          <p className="text-3xl font-semibold tabular-nums">
            {formatMoney(summary.spentPaisa)}
            <span className="ml-2 text-base font-normal text-muted-foreground">
              spent so far
            </span>
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Set a total budget to get a spending status and a warning when you go over.
          </p>
        </div>
      )}
    </div>
  );
}

/** One per-category limit with its own meter. */
function CategoryBudgetRow({ line, category, onSave, onRemove }) {
  const [editing, setEditing] = React.useState(false);

  async function save(value) {
    try {
      await onSave({
        scope: "category",
        categoryId: line.categoryId,
        amount: value,
      });
      setEditing(false);
      toast.success("Category budget saved.");
    } catch (err) {
      toast.error(err.message || "Could not save the budget.");
    }
  }

  return (
    <div className="space-y-2 px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm"
            style={{ background: `${category?.color || "#64748b"}22` }}
            aria-hidden="true"
          >
            {category?.icon || "🏷️"}
          </span>
          <span className="truncate text-sm font-medium">
            {category?.name || "Unknown category"}
          </span>
          {line.carried && (
            <Badge variant="secondary" className="shrink-0">
              Carried over
            </Badge>
          )}
        </div>

        {editing ? (
          <AmountEditor
            label={`${category?.name || "Category"} budget amount`}
            initial={String(line.budgetPaisa / 100)}
            onSave={save}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              onClick={() => setEditing(true)}
              aria-label={`Edit ${category?.name || "category"} budget`}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onRemove(line)}
              aria-label={`Remove ${category?.name || "category"} budget`}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
      <BudgetMeter spentPaisa={line.spentPaisa} budgetPaisa={line.budgetPaisa} />
    </div>
  );
}

/** Adds a limit for a category that doesn't have one yet. */
function AddCategoryBudget({ categories, taken, onSave }) {
  const [open, setOpen] = React.useState(false);
  const [categoryId, setCategoryId] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const options = React.useMemo(
    () => categoryOptions(categories).filter((c) => !taken.has(String(c._id))),
    [categories, taken]
  );

  React.useEffect(() => {
    if (open) setCategoryId(options[0]?._id || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) {
    return (
      <div className="px-3 py-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
          disabled={options.length === 0}
        >
          <Plus className="h-3.5 w-3.5" />
          Add category budget
        </Button>
        {options.length === 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Every category already has a budget.
          </p>
        )}
      </div>
    );
  }

  async function submit(e) {
    e.preventDefault();
    if (!categoryId || !(Number(amount) > 0)) return;
    setSaving(true);
    try {
      await onSave({ scope: "category", categoryId, amount });
      toast.success("Category budget added.");
      setOpen(false);
      setAmount("");
    } catch (err) {
      toast.error(err.message || "Could not save the budget.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 border-t bg-accent/30 px-3 py-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="budget-category">Category</Label>
          <Select
            id="budget-category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            {options.map((c) => (
              <option key={c._id} value={c._id}>
                {c.depth ? "— " : ""}
                {c.icon} {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="budget-amount">Limit</Label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              NPR
            </span>
            <Input
              id="budget-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="pl-11 tabular-nums"
            />
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={saving || !(Number(amount) > 0)}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

/**
 * Budget tab — one total limit per week or month, optional per-category
 * limits, and the warnings that fire when spending runs past either.
 */
export function BudgetTab({ categories }) {
  const summary = useBudgetStore((s) => s.summary);
  const loading = useBudgetStore((s) => s.loadingSummary);
  const period = useBudgetStore((s) => s.budgetPeriod);
  const loadSummary = useBudgetStore((s) => s.loadSummary);
  const setBudget = useBudgetStore((s) => s.setBudget);

  const catMap = React.useMemo(() => categoryMap(categories), [categories]);

  // The page seeds the summary server-side; this covers the case where it
  // could not be loaded there (or the tab is reached without it).
  React.useEffect(() => {
    if (!summary && !loading) loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function removeCategoryBudget(line) {
    try {
      await setBudget({ scope: "category", categoryId: line.categoryId, amount: 0 });
      toast.success("Category budget removed.");
    } catch (err) {
      toast.error(err.message || "Could not remove the budget.");
    }
  }

  if (loading && !summary) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  if (!summary) return null;

  const periodLabel = budgetPeriodLabel(period);
  const periodWord = period === "weekly" ? "this week" : "this month";
  const taken = new Set(summary.categories.map((c) => c.categoryId));
  const overCategories = summary.categories.filter(
    (c) => c.budgetPaisa > 0 && c.spentPaisa > c.budgetPaisa
  );

  return (
    <div className="space-y-4">
      {/* Period switch */}
      <div className="flex items-center gap-1 rounded-lg bg-muted p-1 text-sm">
        {BUDGET_PERIODS.map((p) => (
          <button
            key={p.id}
            onClick={() => loadSummary(p.id)}
            aria-pressed={period === p.id}
            className={cn(
              "rounded-md px-3 py-1 font-medium transition-colors",
              period === p.id
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <BudgetAlert
        spentPaisa={summary.spentPaisa}
        budgetPaisa={summary.totalBudgetPaisa}
        periodLabel={periodWord}
      />

      <TotalBudgetCard
        summary={summary}
        periodLabel={periodLabel}
        onSave={setBudget}
      />

      {overCategories.length > 0 && (
        <div className="space-y-2">
          {overCategories.map((line) => (
            <BudgetAlert
              key={line.categoryId}
              spentPaisa={line.spentPaisa}
              budgetPaisa={line.budgetPaisa}
              label={catMap[line.categoryId]?.name}
              periodLabel={periodWord}
            />
          ))}
        </div>
      )}

      <div className="rounded-xl border bg-card">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Wallet className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Category limits</h3>
          <span className="text-xs text-muted-foreground">
            {summary.categories.length || "none set"}
          </span>
        </div>

        {summary.categories.length === 0 ? (
          <div className="px-4 py-6">
            <EmptyState
              icon={Wallet}
              title="No category limits yet"
              description="Cap the categories that tend to run away — groceries, eating out, shopping — and get warned before the whole budget goes."
            />
          </div>
        ) : (
          <div className="divide-y">
            {summary.categories.map((line) => (
              <CategoryBudgetRow
                key={line.categoryId}
                line={line}
                category={catMap[line.categoryId]}
                onSave={setBudget}
                onRemove={removeCategoryBudget}
              />
            ))}
          </div>
        )}

        <AddCategoryBudget
          categories={categories}
          taken={taken}
          onSave={setBudget}
        />
      </div>
    </div>
  );
}
