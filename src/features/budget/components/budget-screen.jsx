"use client";

import * as React from "react";
import { Info, X } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useBudgetStore } from "../store";
import { ExpenseList } from "./expense-list";
import { CategoryManager } from "./category-manager";
import { BudgetTab } from "./budget-tab";
import { DebtTab } from "./debt-tab";
import { FinancialGoalsTab } from "./financial-goals-tab";

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
        Log expenses in <strong className="font-medium">Expenses</strong>, cap your
        spending in <strong className="font-medium">Budget</strong>, pay down what you
        owe in <strong className="font-medium">Debts</strong>, and save towards
        something in <strong className="font-medium">Goals</strong>. None of it is
        required — start wherever you like.
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

export function BudgetScreen({
  initialCategories,
  initialExpenses,
  initialTotalPaisa,
  initialSummary,
  initialDebts,
  initialFinancialGoals,
}) {
  const setCategories = useBudgetStore((s) => s.setCategories);
  const setExpenses = useBudgetStore((s) => s.setExpenses);
  const setSummary = useBudgetStore((s) => s.setSummary);
  const setDebts = useBudgetStore((s) => s.setDebts);
  const setFinancialGoals = useBudgetStore((s) => s.setFinancialGoals);
  const categories = useBudgetStore((s) => s.categories);

  React.useEffect(() => {
    setCategories(initialCategories);
    setExpenses(initialExpenses, initialTotalPaisa);
    if (initialSummary) setSummary(initialSummary);
    setDebts(initialDebts || []);
    setFinancialGoals(initialFinancialGoals || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <BudgetHint />
      <Tabs defaultValue="expenses">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="budget">Budget</TabsTrigger>
          <TabsTrigger value="debts">Debts</TabsTrigger>
          <TabsTrigger value="goals">Goals</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
        </TabsList>

        <TabsContent value="expenses">
          <ExpenseList categories={categories} />
        </TabsContent>

        <TabsContent value="budget">
          <BudgetTab categories={categories} />
        </TabsContent>

        <TabsContent value="debts">
          <DebtTab />
        </TabsContent>

        <TabsContent value="goals">
          <FinancialGoalsTab />
        </TabsContent>

        <TabsContent value="categories">
          <CategoryManager categories={categories} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
