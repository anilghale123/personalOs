import { withRoute, json } from "@/lib/api";
import { plain } from "@/lib/serialize";
import { invalidateChallenges } from "@/lib/cache";
import Challenge from "@/models/Challenge";
import ChallengeLog from "@/models/ChallengeLog";
import {
  currentDay,
  dayScore,
  effectiveStatus,
  localDateKey,
} from "@/features/challenge/utils";
import { materializeTrackers, assertNoErrors } from "@/features/challenge/service";
import { ChallengesQuery, CreateChallenge } from "@/features/challenge/schemas";

/** A challenge plus the summary fields a list row shows. */
async function summarize(challenge) {
  const c = plain(challenge);
  const todayKey = localDateKey();
  const day = currentDay(challenge, todayKey);
  c.status = effectiveStatus(challenge, todayKey);
  c.dayNumber = day;

  // Today's score, if the day is logged — one scoped read.
  const log = await ChallengeLog.findOne({
    challengeId: challenge._id,
    date: todayKey,
  }).lean();
  c.todayScore = log ? dayScore(challenge, plain(log)) : null;
  c.loggedDays = await ChallengeLog.countDocuments({ challengeId: challenge._id });

  return c;
}

/** GET /api/challenges?status= — the caller's challenges, with summaries. */
export const GET = withRoute(
  { limit: "read", query: ChallengesQuery },
  async ({ userId, query }) => {
    const filter = { userId };
    if (query.status) filter.status = query.status;
    const challenges = await Challenge.find(filter).sort({ createdAt: -1 }).lean();
    return json(await Promise.all(challenges.map(summarize)));
  }
);

/**
 * POST /api/challenges — create a challenge with its tracker tree.
 *
 * `validate()` runs the model's structural hook (depth, rollup children,
 * sets-on-leaves, goal-required) before anything is written.
 */
export const POST = withRoute(
  { limit: "write", body: CreateChallenge },
  async ({ userId, input }) => {
    const { trackers, errors } = materializeTrackers(input.trackers, {
      currentDay: 1,
    });
    assertNoErrors(errors);

    const doc = new Challenge({
      userId,
      title: input.title,
      ...(input.description ? { description: input.description } : {}),
      startDate: input.startDate,
      totalDays: input.totalDays,
      color: input.color,
      trackers,
    });
    await doc.validate();
    const challenge = await doc.save();

    invalidateChallenges(userId);
    return json(plain(challenge), { status: 201 });
  }
);
