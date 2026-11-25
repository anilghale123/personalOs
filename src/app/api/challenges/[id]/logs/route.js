import { withRoute, json, must } from "@/lib/api";
import { plain } from "@/lib/serialize";
import Challenge from "@/models/Challenge";
import ChallengeLog from "@/models/ChallengeLog";
import { LogsQuery } from "@/features/challenge/schemas";

/**
 * GET /api/challenges/[id]/logs?from=&to=
 *
 * The day logs in a date range, ascending. `from`/`to` bound the date keys
 * (inclusive); the logger asks for the window it shows, the dashboard asks
 * for the whole challenge. Bounding on the server matters for the long
 * challenges — a 365-day log range is a real amount of data to pull, and the
 * logger only ever needs a slice of it.
 */
export const GET = withRoute(
  { limit: "read", params: ["id"], query: LogsQuery },
  async ({ userId, params, query }) => {
    const challenge = must(
      await Challenge.findOne({ _id: params.id, userId }).lean()
    );
    const match = { challengeId: challenge._id };
    if (query.from) match.date = { ...(match.date || {}), $gte: query.from };
    if (query.to) match.date = { ...(match.date || {}), $lte: query.to };

    const logs = await ChallengeLog.find(match).sort({ date: 1 }).lean();
    return json(plain(logs));
  }
);
