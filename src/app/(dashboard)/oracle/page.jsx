import { Sparkles } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { OracleClient } from "@/features/oracle/components/oracle-client";

export default function OraclePage() {
  return (
    <>
      <PageHeader
        icon={Sparkles}
        title="Oracle"
        subtitle="AI-generated weekly briefings across every module of your life."
      />
      <OracleClient />
    </>
  );
}
