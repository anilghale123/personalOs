"use client";

import * as React from "react";
import { PieChart, X } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useBudgetStore } from "../store";
import { categoryMap } from "../utils";
import { PAYMENT_METHODS, SORT_OPTIONS } from "../constants";

/**
 * Attach category metadata to server-computed totals.
 *
 * The summing itself moved to `/api/budget/expenses/breakdown`. It used to
 * happen here over the fetched expense list, which was correct only while that
 * list was unpaginated — once it returned a page of 50, this described the
 * first 50 expenses rather than the whole filtered period, and nothing on
 * screen indicated the numbers were partial.
 */
function withCategories(rows, catMap) {
  return rows.map((row) => ({
    id: row.categoryId ?? "",
    totalPaisa: row.totalPaisa,
    count: row.count,
    category: catMap[row.categoryId ?? ""],
  }));
}

/**
 * The Filter tab, at every screen size.
 *
 * It began as a phones-only alternative to a filter bar above the list, but
 * the bar and the tab were two implementations of one thing — and the tab is
 * the better one, because it leads with what people are actually reaching for
 * when they filter: what each category cost over the current range. Tapping a
 * category row filters the list to it. The desktop bar is gone.
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
  const loadBreakdown = useBudgetStore((s) => s.loadBreakdown);
  const hasFreshBreakdown = useBudgetStore((s) => s.hasFreshBreakdown);

  /**
   * The breakdown deliberately ignores the category filter — picking a
   * category must narrow the list without collapsing the very summary that
   * was used to pick it.
   *
   * Served from the store's cache when one is warm, which matters because
   * this panel lives in a tab: switching away unmounts it, so it used to
   * refetch on *every* visit, behind a 250ms debounce, to recompute numbers
   * that had not changed. A cache hit now renders synchronously with no
   * debounce and no request at all — the debounce exists to coalesce
   * keystrokes in the search box, and there are no keystrokes to coalesce
   * when the answer is already known.
   */
  React.useEffect(() => {
    const controller = new AbortController();
    const filters = { paymentMethod, dateFrom, dateTo, q };
    let timer;

    const run = async () => {
      try {
        const { rows: fresh } = await loadBreakdown(filters, {
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setRows(withCategories(fresh, catMap));
          setLoading(false);
        }
      } catch {
        if (!controller.signal.aborted) {
          setRows([]);
          setLoading(false);
        }
      }
    };

    if (hasFreshBreakdown(filters)) {
      run();
    } else {
      setLoading(true);
      timer = setTimeout(run, 250);
    }

    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [paymentMethod, dateFrom, dateTo, q, catMap, loadBreakdown, hasFreshBreakdown]);

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
