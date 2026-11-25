import { ChallengeDetail } from "@/features/challenge/components/challenge-detail";

/**
 * The id is passed to the client, which fetches everything: this route stays
 * a thin wrapper (the screen reads its own data, for the same prerendering
 * reason the planner page is a wrapper).
 */
export default function ChallengePage({ params }) {
  return <ChallengeDetail id={params.id} />;
}
