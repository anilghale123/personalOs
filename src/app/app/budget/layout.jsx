import { BudgetHydrator } from "@/features/budget/components/budget-hydrator";
import { MoneyTabs } from "@/features/budget/components/money-tabs";

export const dynamic = "force-dynamic";

/**
 * Nothing is fetched here any more. This layout used to run six queries
 * before any Money screen could appear; now the hydrator fills the store
 * from the copy saved on this device and refreshes it in the background.
 */
export default function BudgetLayout({ children }) {
  return (
    <>
      <BudgetHydrator />
      <MoneyTabs />
      {children}
    </>
  );
}
