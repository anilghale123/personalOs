"use client";

import * as React from "react";
import { Info, X } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useBudgetStore } from "../store";
import { AddExpenseForm } from "./add-expense-form";
import { ExpenseList } from "./expense-list";
import { CategoryManager } from "./category-manager";

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
        You don&apos;t need a budget to use this — just log expenses and see where your money goes.
        Set a monthly budget any time to get spending status and warnings.
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

export function BudgetScreen({ initialCategories, initialExpenses, initialTotalPaisa }) {
  const setCategories = useBudgetStore((s) => s.setCategories);
  const setExpenses = useBudgetStore((s) => s.setExpenses);
  const categories = useBudgetStore((s) => s.categories);

  React.useEffect(() => {
    setCategories(initialCategories);
    setExpenses(initialExpenses, initialTotalPaisa);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <BudgetHint />
      <Tabs defaultValue="expenses">
        <TabsList>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
        </TabsList>

        <TabsContent value="expenses" className="space-y-4">
          <AddExpenseForm categories={categories} />
          <ExpenseList categories={categories} />
        </TabsContent>

        <TabsContent value="categories">
          <CategoryManager categories={categories} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
