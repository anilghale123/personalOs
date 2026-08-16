"use client";

import * as React from "react";
import { Search, X, Receipt } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/empty-state";
import { useBudgetStore } from "../store";
import { categoryMap, pickableCategories } from "../utils";
import { PAYMENT_METHODS, SORT_OPTIONS } from "../constants";
import { ExpenseRow } from "./expense-row";
import { RunningTotalBar } from "./running-total-bar";

export function ExpenseList({ categories }) {
  const expenses = useBudgetStore((s) => s.expenses);
  const totalPaisa = useBudgetStore((s) => s.totalPaisa);
  const loadExpenses = useBudgetStore((s) => s.loadExpenses);
  const [q, setQ] = React.useState("");
  const [categoryId, setCategoryId] = React.useState("");
  const [paymentMethod, setPaymentMethod] = React.useState("");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [sort, setSort] = React.useState("date_desc");

  // Debounced re-fetch whenever any filter changes.
  React.useEffect(() => {
    const t = setTimeout(() => {
      loadExpenses({ q, categoryId, paymentMethod, dateFrom, dateTo, sort });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, categoryId, paymentMethod, dateFrom, dateTo, sort]);

  const catMap = categoryMap(categories);
  const isFiltered = q || categoryId || paymentMethod || dateFrom || dateTo;

  function clearFilters() {
    setQ("");
    setCategoryId("");
    setPaymentMethod("");
    setDateFrom("");
    setDateTo("");
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-56">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search notes…"
            className="h-8 pl-8"
          />
        </div>
        <Select className="h-8 w-40" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">All categories</option>
          {pickableCategories(categories).map((c) => (
            <option key={c._id} value={c._id}>
              {c.icon} {c.name}
            </option>
          ))}
        </Select>
        <Select
          className="h-8 w-36"
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value)}
        >
          <option value="">Any payment</option>
          {PAYMENT_METHODS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="h-8 w-36"
          aria-label="From date"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="h-8 w-36"
          aria-label="To date"
        />
        <Select className="h-8 w-40" value={sort} onChange={(e) => setSort(e.target.value)}>
          {SORT_OPTIONS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
        {isFiltered && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </div>

      {expenses.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={isFiltered ? "No expenses match these filters" : "No expenses yet"}
          description={
            isFiltered
              ? "Try widening your date range or clearing a filter."
              : "Log your first expense above — amount and category are all you need."
          }
        />
      ) : (
        <div className="divide-y rounded-xl border bg-card">
          {expenses.map((e) => (
            <div key={e._id} className="px-2">
              <ExpenseRow expense={e} category={catMap[e.categoryId]} categories={categories} />
            </div>
          ))}
        </div>
      )}

      {expenses.length > 0 && (
        <RunningTotalBar totalPaisa={totalPaisa} count={expenses.length} />
      )}
    </div>
  );
}
