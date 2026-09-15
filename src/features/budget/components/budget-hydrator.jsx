"use client";

import * as React from "react";
import { useAppUser } from "@/components/app-user";
import { readSnapshot, writeSnapshot } from "@/lib/snapshot";
import { useBudgetStore } from "../store";

const SNAPSHOT_KEY = "money";

/**
 * Fills the budget store for every /budget/* page: from the copy saved on
 * this device first (so the section paints at once), then from the server
 * in the background. The expense list loads itself — see loadExpenses.
 */
export function BudgetHydrator() {
  const userId = useAppUser()?.id;

  React.useEffect(() => {
    const store = useBudgetStore.getState();
    store.setOwner(userId);
    // Already filled earlier in this visit: that copy is newer than the
    // saved one, so only the refresh below is needed.
    if (!store.moneyReady) {
      const saved = readSnapshot(userId, SNAPSHOT_KEY);
      if (saved) store.seedMoney(saved);
    }
    store.refreshMoney().catch(() => {});
  }, [userId]);

  // Keep the saved copy in step with every change — fetched or made here.
  React.useEffect(() => {
    if (!userId) return undefined;
    return useBudgetStore.subscribe((state, prev) => {
      if (!state.moneyReady) return;
      if (
        state.categories === prev.categories &&
        state.summary === prev.summary &&
        state.debts === prev.debts &&
        state.financialGoals === prev.financialGoals
      ) {
        return;
      }
      writeSnapshot(userId, SNAPSHOT_KEY, {
        categories: state.categories,
        summary: state.summary,
        debts: state.debts,
        financialGoals: state.financialGoals,
      });
    });
  }, [userId]);

  return null;
}
