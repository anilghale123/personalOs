import {
  ensureDefaultCategories,
  getBudgetSummary,
  getCategories,
  getCurrentMonthExpenses,
  getDebts,
  getFinancialGoals,
} from "@/features/budget/actions";
import { BudgetHydrator } from "@/features/budget/components/budget-hydrator";

export const dynamic = "force-dynamic";

export default async function BudgetLayout({ children }) {
  await ensureDefaultCategories();
  const [categories, { expenses, totalPaisa }, summary, debts, financialGoals] =
    await Promise.all([
      getCategories(),
      getCurrentMonthExpenses(),
      getBudgetSummary("monthly"),
      getDebts(),
      getFinancialGoals(),
    ]);

  return (
    <>
      <BudgetHydrator
        initialCategories={categories}
        initialExpenses={expenses}
        initialTotalPaisa={totalPaisa}
        initialSummary={summary}
        initialDebts={debts}
        initialFinancialGoals={financialGoals}
      />
      {children}
    </>
  );
}
