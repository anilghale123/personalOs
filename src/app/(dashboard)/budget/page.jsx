import { Receipt } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import {
  ensureDefaultCategories,
  getCategories,
  getCurrentMonthExpenses,
} from "@/features/budget/actions";
import { BudgetScreen } from "@/features/budget/components/budget-screen";

export const dynamic = "force-dynamic";

export default async function BudgetPage() {
  await ensureDefaultCategories();
  const [categories, { expenses, totalPaisa }] = await Promise.all([
    getCategories(),
    getCurrentMonthExpenses(),
  ]);

  return (
    <>
      <PageHeader
        icon={Receipt}
        title="Budgeting"
        subtitle="Track where your money goes, category by category."
      />
      <BudgetScreen
        initialCategories={categories}
        initialExpenses={expenses}
        initialTotalPaisa={totalPaisa}
      />
    </>
  );
}
