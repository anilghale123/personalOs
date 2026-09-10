"use client";

import * as React from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Receipt,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { cn, formatDate, toDateKey } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import {
  compareMonthCursors,
  currentMonthCursor,
  cursorForDateKey,
  exactMonthCursor,
  monthCursorLabel,
  monthCursorRange,
  shiftMonthCursor,
} from "@/lib/months";
import { formatBsDate } from "@/lib/nepali-date";
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

export function ExpenseList({
  categories,
  earliestDate: initialEarliestDate,
  dateFormat,
  filters,
}) {
  const expenses = useBudgetStore((s) => s.expenses);
  const totalPaisa = useBudgetStore((s) => s.totalPaisa);
  const summary = useBudgetStore((s) => s.summary);
  const budgetPeriod = useBudgetStore((s) => s.budgetPeriod);
  // The store copy refreshes on every fetch; the prop covers first paint.
  const storeEarliestDate = useBudgetStore((s) => s.earliestDate);
  const earliestDate = storeEarliestDate ?? initialEarliestDate ?? null;

  const cal = dateFormat === "nepali" ? "np" : "en";
  const todayKey = toDateKey();
  const currentCursor = currentMonthCursor(cal, todayKey);
  // The monthly record appears once history spans more than this month.
  const hasMonthlyRecord = earliestDate
    ? compareMonthCursors(cursorForDateKey(earliestDate, cal), currentCursor) < 0
    : false;

  // The filter set lives in the screen above — the Filter tab on phones
  // edits the same state while this list is unmounted.
  const {
    q,
    setQ,
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
    showFilters,
    setShowFilters,
    clearFilters,
  } = filters;

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState(null);

  const catMap = React.useMemo(() => categoryMap(categories), [categories]);
  const options = React.useMemo(() => categoryOptions(categories), [categories]);

  // The month the active range maps to — set only when the range is
  // exactly one calendar month, so manual date edits read as "custom".
  const activeCursor = exactMonthCursor(dateFrom, dateTo, cal);
  const earliestCursor = earliestDate
    ? cursorForDateKey(earliestDate, cal)
    : null;
  const canGoPrev = Boolean(
    activeCursor &&
      earliestCursor &&
      compareMonthCursors(activeCursor, earliestCursor) > 0
  );
  const canGoNext = Boolean(
    activeCursor && compareMonthCursors(activeCursor, currentCursor) < 0
  );

  // Month-pager dates are navigation, not filters — they don't count
  // towards the badge while a month is selected.
  const activeFilters = [
    categoryId,
    paymentMethod,
    ...(activeCursor ? [] : [dateFrom, dateTo]),
  ].filter(Boolean).length;
  const isFiltered = Boolean(q) || activeFilters > 0;
  // Day headers only make sense while the list is in date order; sorting
  // by amount falls back to one flat list.
  const grouped = sort.startsWith("date");
  const groups = React.useMemo(
    () => (grouped ? groupByDate(expenses) : []),
    [expenses, grouped]
  );

  function goToCursor(cursor) {
    const range = monthCursorRange(cursor);
    setDateFrom(range.from);
    setDateTo(range.to);
  }

  function shiftMonth(delta) {
    goToCursor(shiftMonthCursor(activeCursor ?? currentCursor, delta));
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
        {/* Phones reach the same filters through the Filter tab instead */}
        <Button
          variant={showFilters || activeFilters ? "secondary" : "outline"}
          size="sm"
          className="hidden h-9 md:inline-flex"
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

      {/* Phones set filters in their own tab — say so here, and offer the
          way out, so an unexpectedly short list is never a mystery. */}
      {activeFilters > 0 && (
        <button
          type="button"
          onClick={clearFilters}
          className="flex w-full items-center gap-1.5 rounded-full bg-primary/10 px-3 py-2 text-xs font-medium text-primary md:hidden"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          {activeFilters} filter{activeFilters > 1 ? "s" : ""} on
          <X className="ml-auto h-3.5 w-3.5" />
        </button>
      )}

      {showFilters && (
        <div className="hidden flex-wrap items-center gap-2 rounded-2xl bg-card elev-sm p-3 md:flex">
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

      {/* Monthly record — appears once the history spans past this month */}
      {hasMonthlyRecord && (
        <div className="flex items-center gap-1 rounded-2xl bg-card elev-sm p-2">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => shiftMonth(-1)}
            disabled={!canGoPrev}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1 text-center text-sm font-medium">
            {activeCursor
              ? monthCursorLabel(activeCursor)
              : dateFrom || dateTo
              ? "Custom range"
              : "All time"}
          </div>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => shiftMonth(1)}
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
      )}

      {expenses.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={
            activeCursor
              ? `No expenses in ${monthCursorLabel(activeCursor)}`
              : isFiltered
              ? "No expenses match these filters"
              : "No expenses yet"
          }
          description={
            activeCursor
              ? "Nothing was logged this month — the arrows above take you to other months."
              : isFiltered
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
        <div className="overflow-hidden rounded-2xl bg-card elev-sm">
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
                  {cal === "np" ? formatBsDate(group.date) : formatDate(group.date)}
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
