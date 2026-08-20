import { Wallet } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { BudgetPlanScreen } from "@/features/budget/components/budget-plan-screen";

export default function BudgetPlanPage() {
  return (
    <>
      <PageHeader
        icon={Wallet}
        title="Budget"
        subtitle="Set a weekly or monthly cap, then watch how spending tracks against it."
      />
      <BudgetPlanScreen />
    </>
  );
}
