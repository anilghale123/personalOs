import { Receipt } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ExpensesScreen } from "@/features/budget/components/budget-screen";

export default function ExpensesPage() {
  return (
    <>
      <PageHeader
        icon={Receipt}
        title="Expenses"
        subtitle="Log spending and keep your categories in one place."
      />
      <ExpensesScreen />
    </>
  );
}
