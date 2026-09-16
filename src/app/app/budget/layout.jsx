import { BudgetHydrator } from "@/features/budget/components/budget-hydrator";
import { MoneyTabs } from "@/features/budget/components/money-tabs";

/**
 * Nothing is fetched here any more. This layout used to run six queries
 * before any Money screen could appear; now the hydrator fills the store
 * from the copy saved on this device and refreshes it in the background.
 *
 * With no query and no session read left, every Money tab is prerendered
 * and prefetched in full, so moving between Expenses, Budget, Debts and
 * Savings goals never waits on the network.
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
