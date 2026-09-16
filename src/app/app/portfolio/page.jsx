import Link from "next/link";
import { Wallet, Repeat } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PortfolioScreen } from "@/features/vault/components/portfolio-screen";

/**
 * Nothing is fetched here: the screen paints what was saved on this device
 * and reads /api/vault/screen behind it, so the route stays prerenderable
 * and the tab is prefetched whole rather than only as far as a skeleton.
 */
export default function PortfolioPage() {
  return (
    <>
      <PageHeader
        icon={Wallet}
        title="Portfolio"
        subtitle="NEPSE holdings, P&L and history"
      >
        <Button asChild variant="outline" size="sm">
          <Link href="/app/portfolio/sip">
            <Repeat className="h-4 w-4" />
            SIPs
          </Link>
        </Button>
      </PageHeader>
      <PortfolioScreen />
    </>
  );
}
