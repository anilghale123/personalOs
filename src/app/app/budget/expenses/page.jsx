import { Receipt } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ExpensesScreen } from "@/features/budget/components/budget-screen";

/**
 * Nothing is fetched here: the screen paints from what was saved on this
 * device and loads the history start, calendar and list in the background.
 * The Pro flag comes from the app shell.
 */
export default function ExpensesPage() {
  return (
    <>
      <PageHeader
        icon={Receipt}
        title="Expenses"
        subtitle="Everything you have spent, and where"
      />
      <ExpensesScreen />
    </>
  );
}
