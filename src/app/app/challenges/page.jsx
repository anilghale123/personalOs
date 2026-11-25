import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ChallengeList } from "@/features/challenge/components/challenge-list";

/**
 * Prerendered: the screen reads its saved copy and the API itself, so opening
 * Challenges never waits on the database (see the planner page's note on why
 * nothing is fetched here).
 */
export default function ChallengesPage() {
  return (
    <>
      <PageHeader
        subtitle="Fixed-length runs with auto-ramping goals"
        title="Challenges"
      >
        <Link href="/app/challenges/new">
          <Button>
            <Plus className="h-4 w-4" />
            New challenge
          </Button>
        </Link>
      </PageHeader>
      <ChallengeList />
    </>
  );
}
