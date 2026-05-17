import Link from "next/link";
import { Repeat, ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { getSIPs } from "@/features/vault/actions";
import { SipManager } from "@/features/vault/components/sip-manager";

export const dynamic = "force-dynamic";

export default async function SipPage() {
  const sips = await getSIPs();

  return (
    <>
      <PageHeader
        icon={Repeat}
        title="SIP Manager"
        subtitle="Track systematic investment plans and their installments."
      >
        <Button asChild variant="outline" size="sm">
          <Link href="/vault">
            <ArrowLeft className="h-4 w-4" />
            Vault
          </Link>
        </Button>
      </PageHeader>
      <SipManager initialSips={sips} />
    </>
  );
}
