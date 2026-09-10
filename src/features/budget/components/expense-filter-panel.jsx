"use client";

import * as React from "react";
import { PieChart, X } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { categoryMap } from "../utils";
import { PAYMENT_METHODS, SORT_OPTIONS } from "../constants";

/** Aggregate a list of expenses into per-category totals, biggest first. */
function totalsByCategory(expenses, catMap) {
  const totals = new Map();
  for (const expense of expenses) {
    const id = String(expense.categoryId || "");
    totals.set(id, (totals.get(id) || 0) + (Number(expense.amountPaisa) || 0));
  }
  return [...totals.entries()]
    .map(([id, totalPaisa]) => ({ id, totalPaisa, category: catMap[id] }))
    .sort((a, b) => b.totalPaisa - a.totalPaisa);
}

/**
 * The Filter tab — phones only.
 *
 * A wide screen can afford a filter bar above the list; a phone cannot.
 * This is that bar given a tab of its own, led by the thing the filters
 * are usually reaching for anyway: what each category cost over the
 * current range. Tapping a category row filters the list to it.
 */
export function ExpenseFilterPanel({ categories, filters }) {
  const {
    categoryId,
    setCategoryId,
    paymentMethod,
    setPaymentMethod,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    sort,
    setSort,
    q,
    clearFilters,
  } = filters;

  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const catMap = React.useMemo(() => categoryMap(categories), [categories]);

  // The breakdown deliberately ignores the category filter — picking a
  // category must narrow the list without collapsing the very summary
  // that was used to pick it.
  React.useEffect(() => {
    const controller = new AbortController();
    const t = setTimeout(async () => {
      const params = new URLSearchParams();
      if (paymentMethod) params.set("paymentMethod", paymentMethod);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (q) params.set("q", q);
      try {
        const res = await fetch(`/api/budget/expenses?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        setRows(totalsByCategory(data.expenses || [], catMap));
      } catch {
        if (!controller.signal.aborted) setRows([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [paymentMethod, dateFrom, dateTo, q, catMap]);

  const total = rows.reduce((sum, r) => sum + r.totalPaisa, 0);
  const max = rows.reduce((m, r) => Math.max(m, r.totalPaisa), 0);
  const isFiltered = Boolean(categoryId || paymentMethod || dateFrom || dateTo);

  return (
    <div className="space-y-4">
      {/* Where the money went */}
      <section className="overflow-hidden rounded-2xl bg-card elev-sm">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <PieChart className="h-4 w-4 text-muted-foreground" />
            By category
          </h3>
          <span className="text-sm font-semibold tabular-nums">
            {formatMoney(total)}
          </span>
        </div>

        {loading ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            Adding it up…
          </p>
        ) : rows.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            Nothing spent in this range yet.
          </p>
        ) : (
          <ul className="divide-y">
            {rows.map((row) => {
              const active = categoryId === row.id;
              const share = max > 0 ? (row.totalPaisa / max) * 100 : 0;
              return (
                <li key={row.id || "uncategorised"}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => setCategoryId(active ? "" : row.id)}
                    className={cn(
                      "relative flex min-h-[48px] w-full items-center gap-2 px-4 py-2 text-left transition-colors",
                      active ? "bg-primary/10" : "active:bg-accent"
                    )}
                  >
                    {/* Share-of-spend bar, sitting behind the label */}
                    <span
                      aria-hidden
                      className="absolute inset-y-1 left-1 rounded-md bg-primary/10"
                      style={{ width: `${Math.max(share, 2)}%` }}
                    />
                    <span className="relative flex min-w-0 flex-1 items-center gap-2">
                      <span aria-hidden className="text-base">
                        {row.category?.icon || "📦"}
                      </span>
                      <span className="truncate text-sm">
                        {row.category?.name || "Uncategorised"}
                      </span>
                    </span>
                    <span className="relative shrink-0 text-sm font-medium tabular-nums">
                      {formatMoney(row.totalPaisa)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Date, payment and order */}
      <section className="space-y-3 rounded-2xl bg-card elev-sm p-4">
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Date range
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              aria-label="From date"
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              aria-label="To date"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Payment method
          </p>
          <Select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            aria-label="Filter by payment method"
          >
            <option value="">Any payment</option>
            {PAYMENT_METHODS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Sort
          </p>
          <Select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label="Sort order"
          >
            {SORT_OPTIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>

        {isFiltered && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={clearFilters}
          >
            <X className="h-3.5 w-3.5" />
            Clear filters
          </Button>
        )}
      </section>
    </div>
  );
}
