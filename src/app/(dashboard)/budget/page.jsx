import { Receipt } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import {
  ensureDefaultCategories,
  getBudgetSummary,
  getCategories,
  getCurrentMonthExpenses,
  getDebts,
  getFinancialGoals,
} from "@/features/budget/actions";
import { BudgetScreen } from "@/features/budget/components/budget-screen";

export const dynamic = "force-dynamic";

export default async function BudgetPage() {
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
      <PageHeader
        icon={Receipt}
        title="Budgeting"
        subtitle="Expenses, budgets, debts and savings goals in one place."
      />
      <BudgetScreen
        initialCategories={categories}
        initialExpenses={expenses}
        initialTotalPaisa={totalPaisa}
        initialSummary={summary}
        initialDebts={debts}
        initialFinancialGoals={financialGoals}
      />
    </>
  );
}
