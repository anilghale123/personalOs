"use client";

import * as React from "react";
import { toast } from "sonner";
import { useAppUser } from "@/components/app-user";
import { useScreenData } from "@/lib/screen-data";
import { VaultClient } from "./vault-client";

const EMPTY = { portfolio: [], transactions: [] };

/**
 * Portfolio.
 *
 * The screen itself is never withheld: `VaultClient` draws the tiles, the
 * holdings table and its buttons on the first frame, whether or not the
 * numbers have arrived. `useScreenData` hands over what this device already
 * has *during* render, so on every open after the first there is nothing
 * missing to draw and no placeholder is ever shown.
 */
export function PortfolioScreen() {
  const userId = useAppUser()?.id;
  const { data, failed } = useScreenData(
    userId,
    "portfolio",
    "/api/vault/screen"
  );

  // Only the very first open on a device, and only until it answers once.
  const pending = data === null && !failed;

  React.useEffect(() => {
    // Worth saying only when there is nothing on screen to read instead.
    if (failed && data === null) toast.error("Couldn't load your portfolio.");
  }, [failed, data]);

  const { portfolio, transactions } = data ?? EMPTY;

  return (
    <VaultClient
      portfolio={portfolio}
      transactions={transactions}
      pending={pending}
    />
  );
}
