"use client";

import * as React from "react";
import { toast } from "sonner";
import { Banknote, ChevronLeft, ChevronRight, Loader2, Plus, Trash2 } from "lucide-react";
import { formatDate, toDateKey } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import {
  compareMonthCursors,
  currentMonthCursor,
  exactMonthCursor,
  monthCursorLabel,
  monthCursorRange,
  shiftMonthCursor,
} from "@/lib/months";
import { formatBsDate } from "@/lib/nepali-date";
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
import { EmptyState } from "@/components/empty-state";
import { INCOME_CATEGORIES, INCOME_PAGE_SIZE } from "@/features/wealth/constants";
import { INCOME_CHANGED_EVENT } from "./voice-entry";

const SOURCE_LABELS = { voice: "Voice", manual: null };

function sourceLabel(source) {
  if (!source) return null;
  if (source.startsWith("import:")) return "Imported";
  return SOURCE_LABELS[source] ?? null;
}

function incomeUrl(dateFrom, dateTo, skip = 0) {
  const params = new URLSearchParams({ limit: String(INCOME_PAGE_SIZE) });
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  if (skip) params.set("skip", String(skip));
  return `/api/wealth/income?${params}`;
}

/**
 * Money in — salary, transfers received, imported deposits.
 *
 * Filtered by the same date range as the expense list (`filters` is owned by
 * the screen), so paging to a month here moves the Expenses tab too.
 */
export function IncomeList({ filters, cal = "en", isPro = false }) {
  const { dateFrom, setDateFrom, dateTo, setDateTo } = filters;
  const [state, setState] = React.useState({ items: [], total: 0, totalPaisa: 0 });
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [addOpen, setAddOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(incomeUrl(dateFrom, dateTo));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load income.");
      setState(data);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  React.useEffect(() => {
    load();
    window.addEventListener(INCOME_CHANGED_EVENT, load);
    return () => window.removeEventListener(INCOME_CHANGED_EVENT, load);
  }, [load]);

  const currentCursor = currentMonthCursor(cal, toDateKey());
  const activeCursor = exactMonthCursor(dateFrom, dateTo, cal);
  const canGoNext = Boolean(activeCursor && compareMonthCursors(activeCursor, currentCursor) < 0);
  const rangeLabel = activeCursor
    ? monthCursorLabel(activeCursor)
    : dateFrom || dateTo
    ? "Custom range"
    : "All time";

  function goToCursor(cursor) {
    const range = monthCursorRange(cursor);
    setDateFrom(range.from);
    setDateTo(range.to);
  }

  async function loadMore() {
    setLoadingMore(true);
    try {
      const res = await fetch(incomeUrl(dateFrom, dateTo, state.items.length));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load more.");
      setState((s) => ({ ...data, items: [...s.items, ...data.items] }));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoadingMore(false);
    }
  }

  async function remove(item) {
    const before = state;
    setState((s) => ({
      ...s,
      items: s.items.filter((i) => i._id !== item._id),
      total: s.total - 1,
      totalPaisa: s.totalPaisa - item.amountPaisa,
    }));
    const res = await fetch(`/api/wealth/income/${item._id}`, { method: "DELETE" });
    if (!res.ok) {
      setState(before);
      toast.error("Could not delete that entry.");
    } else {
      toast.success("Income deleted.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 rounded-2xl bg-card p-2 elev-sm">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => goToCursor(shiftMonthCursor(activeCursor ?? currentCursor, -1))}
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1 text-center text-sm font-medium">{rangeLabel}</div>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => goToCursor(shiftMonthCursor(activeCursor, 1))}
          disabled={!canGoNext}
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        {activeCursor ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 text-muted-foreground"
            onClick={() => {
              setDateFrom("");
              setDateTo("");
            }}
          >
            All time
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 text-muted-foreground"
            onClick={() => goToCursor(currentCursor)}
          >
            This month
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted-foreground">
          {state.total} {state.total === 1 ? "entry" : "entries"} ·{" "}
          <span className="font-medium tabular-nums text-foreground">{formatMoney(state.totalPaisa)}</span>
        </p>
        <Button size="sm" className="ml-auto h-9" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" />
          Add income
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : state.items.length === 0 ? (
        <EmptyState
          icon={Banknote}
          title={dateFrom || dateTo ? `No income in ${rangeLabel === "Custom range" ? "this range" : rangeLabel}` : "No income yet"}
          description={
            dateFrom || dateTo
              ? "Use the arrows to check other months, or show all time."
              : isPro
              ? "Log salary or money received — or say “income salary 35000” with the mic."
              : "Log salary or money received."
          }
        />
      ) : (
        <div className="divide-y overflow-hidden rounded-2xl bg-card px-2 elev-sm">
          {state.items.map((item) => (
            <div key={item._id} className="flex items-center gap-3 px-2 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.note || item.category}</p>
                <p className="text-xs text-muted-foreground">
                  {item.category} · {cal === "np" ? formatBsDate(item.date) : formatDate(item.date)}
                  {sourceLabel(item.source) && ` · ${sourceLabel(item.source)}`}
                </p>
              </div>
              <span className="text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                +{formatMoney(item.amountPaisa)}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground"
                onClick={() => remove(item)}
                aria-label="Delete income"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {!loading && state.items.length < state.total && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load older income"}
          </Button>
        </div>
      )}

      <AddIncomeDialog open={addOpen} onOpenChange={setAddOpen} onSaved={load} />
    </div>
  );
}

const blank = () => ({ amount: "", category: "Salary", date: toDateKey(), note: "" });

function AddIncomeDialog({ open, onOpenChange, onSaved }) {
  const [form, setForm] = React.useState(blank);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) setForm(blank());
  }, [open]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const canSave = Number(form.amount) > 0 && !saving;

  async function submit(e) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    try {
      const res = await fetch("/api/wealth/income", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, note: form.note.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save the income.");
      toast.success("Income added.");
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add income</DialogTitle>
          <DialogDescription>Money in — salary, transfers received, refunds.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="income-amount">Amount</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                NPR
              </span>
              <Input
                id="income-amount"
                inputMode="decimal"
                autoFocus
                value={form.amount}
                onChange={(e) => set({ amount: e.target.value })}
                className="h-12 pl-12 text-lg font-semibold tabular-nums"
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="income-category">Category</Label>
              <Select id="income-category" value={form.category} onChange={(e) => set({ category: e.target.value })}>
                {INCOME_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="income-date">Date</Label>
              <Input id="income-date" type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="income-note">Note</Label>
            <Input id="income-note" maxLength={500} value={form.note} onChange={(e) => set({ note: e.target.value })} />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSave}>
              {saving ? "Saving…" : "Add income"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
