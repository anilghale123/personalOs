import Link from "next/link";
import { Upload, ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ImportClient } from "@/features/vault/components/import-client";

export default function ImportPage() {
  return (
    <>
      <PageHeader
        icon={Upload}
        title="Import Transactions"
        subtitle="Upload a broker CSV to populate your portfolio."
      >
        <Button asChild variant="outline" size="sm">
          <Link href="/portfolio">
            <ArrowLeft className="h-4 w-4" />
            Portfolio
          </Link>
        </Button>
      </PageHeader>
      <ImportClient />
    </>
  );
}
