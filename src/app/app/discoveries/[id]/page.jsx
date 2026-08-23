import { notFound } from "next/navigation";
import { getInsightDetail } from "@/features/patterns/actions";
import { InsightDetail } from "@/features/patterns/components/insight-detail";

export const dynamic = "force-dynamic";

/**
 * One finding, in full: the statement, the chart, the actual days behind
 * it, how confident we are, what it doesn't tell you, and how it has
 * moved across runs.
 */
export default async function InsightDetailPage({ params }) {
  const insight = await getInsightDetail(params.id).catch(() => null);
  if (!insight) notFound();

  return <InsightDetail insight={insight} />;
}
