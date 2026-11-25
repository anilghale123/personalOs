import { PageHeader } from "@/components/page-header";
import { ChallengeBuilder } from "@/features/challenge/components/challenge-builder";

export default function NewChallengePage() {
  return (
    <>
      <PageHeader
        subtitle="Set the goal, the app ramps the rest"
        title="New challenge"
      />
      <ChallengeBuilder />
    </>
  );
}
