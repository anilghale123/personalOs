import { Handshake } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { DebtsScreen } from "@/features/budget/components/debts-screen";

export default function DebtsPage() {
  return (
    <>
      <PageHeader
        icon={Handshake}
        title="Debts"
        subtitle="What you owe, and what is owed to you"
      />
      <DebtsScreen />
    </>
  );
}
