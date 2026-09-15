import { redirect } from "next/navigation";
import { FileUp } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { getSession } from "@/lib/session";
import { getEntitlements } from "@/lib/entitlements";
import { StatementImport } from "@/features/budget/components/statement-import";

export const dynamic = "force-dynamic";

export const metadata = { title: "Import statement · selfView" };

/** Pro only — a free account opening this URL directly lands on Expenses. */
export default async function ImportStatementPage() {
  const session = await getSession();
  const { isPro } = await getEntitlements(session?.user?.id);
  if (!isPro) redirect("/app/budget/expenses");

  return (
    <>
      <PageHeader
        icon={FileUp}
        title="Import statement"
        subtitle="Bank statement → expenses and income"
      />
      <StatementImport />
    </>
  );
}
