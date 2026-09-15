import { Receipt } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ExpensesScreen } from "@/features/budget/components/budget-screen";
import {
  getDateFormat,
  getEarliestExpenseDate,
} from "@/features/budget/actions";
import { getSession } from "@/lib/session";
import { getEntitlements } from "@/lib/entitlements";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  // The monthly record needs both on first paint: how far back the
  // history goes, and which calendar to label it in. The plan decides
  // whether the Pro tools (statement import, voice entry) are shown at all.
  const session = await getSession();
  const [earliestDate, dateFormat, { isPro }] = await Promise.all([
    getEarliestExpenseDate(),
    getDateFormat(),
    getEntitlements(session?.user?.id),
  ]);

  return (
    <>
      <PageHeader
        icon={Receipt}
        title="Expenses"
        subtitle="Everything you have spent, and where"
      />
      <ExpensesScreen earliestDate={earliestDate} dateFormat={dateFormat} isPro={isPro} />
    </>
  );
}
