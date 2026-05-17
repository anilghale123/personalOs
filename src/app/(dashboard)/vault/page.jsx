import Link from "next/link";
import { Wallet, Repeat } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  getPortfolioSummary,
  getRecentTransactions,
} from "@/features/vault/actions";
import { VaultClient } from "@/features/vault/components/vault-client";

export const dynamic = "force-dynamic";

export default async function VaultPage() {
  const [portfolio, transactions] = await Promise.all([
    getPortfolioSummary(),
    getRecentTransactions(),
  ]);

  return (
    <>
      <PageHeader
        icon={Wallet}
        title="Vault"
        subtitle="Your NEPSE portfolio, P&L and transaction history."
      >
        <Button asChild variant="outline" size="sm">
          <Link href="/vault/sip">
            <Repeat className="h-4 w-4" />
            SIPs
          </Link>
        </Button>
      </PageHeader>
      <VaultClient portfolio={portfolio} transactions={transactions} />
    </>
  );
}
