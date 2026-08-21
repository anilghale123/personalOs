import { PiggyBank } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { FinancialGoalsScreen } from "@/features/budget/components/financial-goals-screen";

export default function BudgetGoalsPage() {
  return (
    <>
      <PageHeader
        icon={PiggyBank}
        title="Savings goals"
        subtitle="Put money aside for something specific."
      />
      <FinancialGoalsScreen />
    </>
  );
}
