"use client";

import * as React from "react";
import { useBudgetStore } from "../store";

/**
 * Seeds the budget store once from server-fetched data so every
 * /budget/* page can read from the same client state.
 */
export function BudgetHydrator({
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

  React.useEffect(() => {
    setCategories(initialCategories);
    setExpenses(initialExpenses, initialTotalPaisa);
    if (initialSummary) setSummary(initialSummary);
    setDebts(initialDebts || []);
    setFinancialGoals(initialFinancialGoals || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
