"use client";

import * as React from "react";
import { Plus, Receipt, Search, SlidersHorizontal, X } from "lucide-react";
import { cn, formatDate, toDateKey } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/empty-state";
import { useBudgetStore } from "../store";
import { categoryMap, categoryOptions } from "../utils";
import { PAYMENT_METHODS, SORT_OPTIONS } from "../constants";
import { ExpenseRow } from "./expense-row";
import { ExpenseDialog } from "./expense-dialog";
import { RunningTotalBar } from "./running-total-bar";
import { BudgetAlert } from "./budget-alert";

/** Groups the list into day sections so a long month stays readable. */
function groupByDate(expenses) {
  const groups = new Map();
  for (const expense of expenses) {
    const key = expense.date || toDateKey();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(expense);
  }
  return [...groups.entries()].map(([date, items]) => ({
    date,
    items,
    totalPaisa: items.reduce((sum, e) => sum + (e.amountPaisa || 0), 0),
  }));
}

export function ExpenseList({ categories }) {
  const expenses = useBudgetStore((s) => s.expenses);
  const totalPaisa = useBudgetStore((s) => s.totalPaisa);
  const loadExpenses = useBudgetStore((s) => s.loadExpenses);
  const summary = useBudgetStore((s) => s.summary);
  const budgetPeriod = useBudgetStore((s) => s.budgetPeriod);

  const [q, setQ] = React.useState("");
  const [categoryId, setCategoryId] = React.useState("");
  const [paymentMethod, setPaymentMethod] = React.useState("");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [sort, setSort] = React.useState("date_desc");
  const [showFilters, setShowFilters] = React.useState(false);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState(null);

  // Debounced re-fetch whenever any filter changes.
  React.useEffect(() => {
    const t = setTimeout(() => {
      loadExpenses({ q, categoryId, paymentMethod, dateFrom, dateTo, sort });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, categoryId, paymentMethod, dateFrom, dateTo, sort]);

  const catMap = React.useMemo(() => categoryMap(categories), [categories]);
  const options = React.useMemo(() => categoryOptions(categories), [categories]);
  const activeFilters = [categoryId, paymentMethod, dateFrom, dateTo].filter(
    Boolean
  ).length;
  const isFiltered = Boolean(q) || activeFilters > 0;
  // Day headers only make sense while the list is in date order; sorting
  // by amount falls back to one flat list.
  const grouped = sort.startsWith("date");
  const groups = React.useMemo(
    () => (grouped ? groupByDate(expenses) : []),
    [expenses, grouped]
  );

  function clearFilters() {
    setQ("");
    setCategoryId("");
    setPaymentMethod("");
    setDateFrom("");
    setDateTo("");
  }

  function openAdd() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(expense) {
    setEditing(expense);
    setDialogOpen(true);
  }

  return (
    <div className="space-y-4">
      {summary && (
        <BudgetAlert
          spentPaisa={summary.spentPaisa}
          budgetPaisa={summary.totalBudgetPaisa}
          periodLabel={budgetPeriod === "weekly" ? "this week" : "this month"}
        />
      )}

      {/* Toolbar — search, filters toggle, and the one way in to logging spend */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search notes…"
            className="h-9 pl-8"
          />
        </div>
        <Button
          variant={showFilters || activeFilters ? "secondary" : "outline"}
          size="sm"
          className="h-9"
          onClick={() => setShowFilters((s) => !s)}
          aria-expanded={showFilters}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
          {activeFilters > 0 && (
            <span className="ml-0.5 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
              {activeFilters}
            </span>
          )}
        </Button>
        <Button size="sm" className="ml-auto h-9" onClick={openAdd}>
          <Plus className="h-4 w-4" />
          Add expense
        </Button>
      </div>

      {showFilters && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
          <Select
            className="h-8 w-44"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            aria-label="Filter by category"
          >
            <option value="">All categories</option>
            {options.map((c) => (
              <option key={c._id} value={c._id}>
                {c.depth ? "— " : ""}
                {c.icon} {c.name}
              </option>
            ))}
          </Select>
          <Select
            className="h-8 w-36"
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
          <Select
            className="h-8 w-40"
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
      )}

      {expenses.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={isFiltered ? "No expenses match these filters" : "No expenses yet"}
          description={
            isFiltered
              ? "Try widening your date range or clearing a filter."
              : "Log your first expense — amount and category are all you need."
          }
        >
          {!isFiltered && (
            <Button size="sm" onClick={openAdd}>
              <Plus className="h-4 w-4" />
              Add expense
            </Button>
          )}
        </EmptyState>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          {!grouped && (
            <div className="divide-y px-2">
              {expenses.map((e) => (
                <ExpenseRow
                  key={e._id}
                  expense={e}
                  category={catMap[e.categoryId]}
                  onEdit={openEdit}
                />
              ))}
            </div>
          )}
          {groups.map((group, i) => (
            <div key={group.date} className={cn(i > 0 && "border-t")}>
              <div className="flex items-center justify-between gap-2 bg-muted/40 px-4 py-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {formatDate(group.date)}
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {formatMoney(group.totalPaisa)}
                </span>
              </div>
              <div className="divide-y px-2">
                {group.items.map((e) => (
                  <ExpenseRow
                    key={e._id}
                    expense={e}
                    category={catMap[e.categoryId]}
                    onEdit={openEdit}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {expenses.length > 0 && (
        <RunningTotalBar totalPaisa={totalPaisa} count={expenses.length} />
      )}

      <ExpenseDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        categories={categories}
        expense={editing}
      />
    </div>
  );
}
