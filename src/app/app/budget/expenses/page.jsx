import { Receipt } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ExpensesScreen } from "@/features/budget/components/budget-screen";
import {
  getDateFormat,
  getEarliestExpenseDate,
} from "@/features/budget/actions";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  // The monthly record needs both on first paint: how far back the
  // history goes, and which calendar to label it in.
  const [earliestDate, dateFormat] = await Promise.all([
    getEarliestExpenseDate(),
    getDateFormat(),
  ]);

  return (
    <>
      <PageHeader
        icon={Receipt}
        title="Expenses"
        subtitle="Everything you have spent, and where"
      />
      <ExpensesScreen earliestDate={earliestDate} dateFormat={dateFormat} />
    </>
  );
}
