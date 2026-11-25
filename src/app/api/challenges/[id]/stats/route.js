import { withRoute, json, must } from "@/lib/api";
import { plain } from "@/lib/serialize";
import Challenge from "@/models/Challenge";
import ChallengeLog from "@/models/ChallengeLog";
import { challengeStats, currentDay, localDateKey } from "@/features/challenge/utils";

/**
 * GET /api/challenges/[id]/stats
 *
 * Runs `challengeStats` on the server, over the whole challenge, and returns
 * the result. Computing here (rather than shipping every log to the browser
 * and fitting the regression in JavaScript) is what keeps the 365-day
 * challenge responsive — the browser only ever receives the derived series.
 */
export const GET = withRoute(
  { limit: "read", params: ["id"] },
  async ({ userId, params }) => {
    const challenge = must(await Challenge.findOne({ _id: params.id, userId }).lean());
    const logs = await ChallengeLog.find({ challengeId: challenge._id })
      .sort({ date: 1 })
      .lean();

    const stats = challengeStats(
      plain(challenge),
      plain(logs),
      currentDay(challenge, localDateKey())
    );
    return json(stats);
  }
);
