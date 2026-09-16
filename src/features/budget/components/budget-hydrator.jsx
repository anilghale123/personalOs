"use client";

import * as React from "react";
import { useAppUser } from "@/components/app-user";
import { useIsomorphicLayoutEffect } from "@/lib/client-clock";
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

  /**
   * Seed before the browser paints.
   *
   * This ran in a passive effect, which happens *after* the first paint — so
   * every open of a Money tab drew an empty screen first and filled it in a
   * frame later, even though the section had been saved on this device since
   * the last visit. A layout effect puts the numbers in the store before the
   * screen is drawn for the first time, so there is nothing to fill in.
   *
   * The shell resolves the user just after this first runs; waiting for it
   * costs a tick and saves loading the section twice, and the saved copies
   * are filed under the id, so there is nothing to read before it anyway.
   */
  useIsomorphicLayoutEffect(() => {
    if (!userId) return;
    const store = useBudgetStore.getState();
    store.setOwner(userId);
    // Already filled earlier in this visit: that copy is newer than the
    // saved one, so only the refresh below is needed.
    if (!store.moneyReady) {
      const saved = readSnapshot(userId, SNAPSHOT_KEY);
      if (saved) store.seedMoney(saved);
    }
  }, [userId]);

  // The re-read itself is ordinary background work and stays passive.
  React.useEffect(() => {
    if (!userId) return;
    useBudgetStore.getState().refreshMoney().catch(() => {});
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
