"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Info, X } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppUser } from "@/components/app-user";
import { readSnapshot, sameData, writeSnapshot } from "@/lib/snapshot";
import { useBudgetStore } from "../store";
import { ExpenseList } from "./expense-list";
import { ExpenseFilterPanel } from "./expense-filter-panel";
import { useExpenseFilters } from "./expense-filters";
import { CategoryManager } from "./category-manager";
import { IncomeList } from "./income-list";

const HINT_KEY = "budget-hint-dismissed";

function BudgetHint() {
  const [dismissed, setDismissed] = React.useState(true);

  React.useEffect(() => {
    setDismissed(localStorage.getItem(HINT_KEY) === "1");
  }, []);

  if (dismissed) return null;

  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-brand/30 bg-brand/5 px-4 py-3 text-sm">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
      <p className="flex-1 text-muted-foreground">
        Log spending here, then use the sidebar to set a{" "}
        <strong className="font-medium">Budget</strong>, track{" "}
        <strong className="font-medium">Debts</strong>, or save towards{" "}
        <strong className="font-medium">Goals</strong>.
      </p>
      <button
        onClick={() => {
          localStorage.setItem(HINT_KEY, "1");
          setDismissed(true);
        }}
        aria-label="Dismiss hint"
        className="shrink-0 text-muted-foreground hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * What the list needs before its first paint — how far back the history
 * goes and which calendar to use. Saved copy first, server copy after.
 */
function useExpenseMeta(userId) {
  const [meta, setMeta] = React.useState(null);

  React.useEffect(() => {
    let cancelled = false;
    const saved = readSnapshot(userId, "expenses-meta");
    if (saved) setMeta(saved);

    fetch("/api/budget/meta")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error())))
      .then((data) => {
        if (cancelled) return;
        writeSnapshot(userId, "expenses-meta", data);
        setMeta((current) => (sameData(current, data) ? current : data));
      })
      .catch(() => {
        // Offline with nothing saved: open on the defaults, not a skeleton forever.
        if (!cancelled) {
          setMeta((current) => current ?? { earliestDate: null, dateFormat: "english" });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return meta;
}

/** The very first visit only — every later open paints from the saved copy. */
function ExpensesSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading expenses">
      <Skeleton className="h-9 w-72 max-w-full rounded-lg" />
      <Skeleton className="h-9 w-full rounded-lg" />
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-xl" />
      ))}
    </div>
  );
}

export function ExpensesScreen() {
  const user = useAppUser();
  const meta = useExpenseMeta(user?.id);
  if (!meta) return <ExpensesSkeleton />;

  // Keyed by calendar: the opening month is worked out once on mount, so a
  // calendar change has to start the screen afresh.
  return (
    <ExpensesTabs
      key={meta.dateFormat}
      earliestDate={meta.earliestDate}
      dateFormat={meta.dateFormat}
      isPro={Boolean(user?.isPro)}
    />
  );
}

function ExpensesTabs({ earliestDate, dateFormat, isPro = false }) {
  const categories = useBudgetStore((s) => s.categories);
  const cal = dateFormat === "nepali" ? "np" : "en";
  // Owned here, not in the list: the filters live in their own tab, so the
  // list is unmounted while they are being changed.
  const filters = useExpenseFilters({ earliestDate, cal });
  // `?tab=income` — where a deposits-only statement import lands.
  const initialTab = useSearchParams().get("tab") === "income" ? "income" : "expenses";

  return (
    <div className="space-y-4">
      <BudgetHint />
      <Tabs defaultValue={initialTab}>
        <TabsList>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="income">Income</TabsTrigger>
          <TabsTrigger value="filter">Filter</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
        </TabsList>

        <TabsContent value="expenses">
          <ExpenseList
            categories={categories}
            earliestDate={earliestDate}
            dateFormat={dateFormat}
            filters={filters}
            isPro={isPro}
          />
        </TabsContent>

        <TabsContent value="income">
          {/* Shares the expense list's date range, so both tabs show the same month. */}
          <IncomeList filters={filters} cal={cal} isPro={isPro} />
        </TabsContent>

        <TabsContent value="filter">
          <ExpenseFilterPanel
            categories={categories}
            filters={filters}
            cal={cal}
          />
        </TabsContent>

        <TabsContent value="categories">
          <CategoryManager categories={categories} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
