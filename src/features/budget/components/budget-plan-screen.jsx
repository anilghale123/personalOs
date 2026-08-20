"use client";

import { useBudgetStore } from "../store";
import { BudgetTab } from "./budget-tab";

export function BudgetPlanScreen() {
  const categories = useBudgetStore((s) => s.categories);
  return <BudgetTab categories={categories} />;
}
