import { withRoute, json, must, badRequest } from "@/lib/api";
import { plain } from "@/lib/serialize";
import { invalidateChallenges } from "@/lib/cache";
import Challenge from "@/models/Challenge";
import ChallengeLog from "@/models/ChallengeLog";
import {
  currentDay,
  effectiveStatus,
  localDateKey,
} from "@/features/challenge/utils";
import { materializeTrackers, assertNoErrors } from "@/features/challenge/service";
import { UpdateChallenge } from "@/features/challenge/schemas";

/** Load the caller's challenge or 404. */
async function loadOwned(userId, id) {
  return must(await Challenge.findOne({ _id: id, userId }).lean());
}

/** GET /api/challenges/[id] — the challenge and its tracker tree. */
export const GET = withRoute(
  { limit: "read", params: ["id"] },
  async ({ userId, params }) => {
    const challenge = await loadOwned(userId, params.id);
    const c = plain(challenge);
    const todayKey = localDateKey();
    c.status = effectiveStatus(challenge, todayKey);
    c.dayNumber = currentDay(challenge, todayKey);
    return json(c);
  }
);

/**
 * PATCH /api/challenges/[id] — edit the title, description, status, color,
 * dates, or the whole tracker tree.
 *
 * Tracker edits follow the brief's rules (see the service): a tracker added
 * now starts its ramp today, one removed with logs is archived, and a metric
 * cannot change once it has logs. The whole tree is re-validated through the
 * model hook, so a bad structure is rejected atomically.
 */
export const PATCH = withRoute(
  { limit: "write", params: ["id"], body: UpdateChallenge },
  async ({ userId, params, input }) => {
    const challenge = await loadOwned(userId, params.id);
    const todayKey = localDateKey();
    const set = {};

    if (input.title !== undefined) set.title = input.title;
    if (input.description !== undefined) {
      set.description = input.description ?? "";
    }
    if (input.status !== undefined) set.status = input.status;
    if (input.color !== undefined) set.color = input.color;
    if (input.startDate !== undefined) set.startDate = input.startDate;
    if (input.totalDays !== undefined) set.totalDays = input.totalDays;

    if (input.trackers !== undefined) {
      const loggedIds = new Set(
        (await ChallengeLog.find({ challengeId: params.id })
          .select("entries")
          .lean())
          .flatMap((l) => (l.entries || []).map((e) => String(e.trackerId)))
      );
      const { trackers, errors } = materializeTrackers(input.trackers, {
        existing: challenge.trackers,
        loggedIds,
        currentDay: currentDay(challenge, todayKey),
      });
      assertNoErrors(errors);
      set.trackers = trackers;
    }

    if (Object.keys(set).length === 0) throw badRequest("Nothing to update.");

    const doc = await Challenge.findOneAndUpdate(
      { _id: params.id, userId },
      { $set: set },
      { new: true, runValidators: true }
    ).lean();
    must(doc);

    invalidateChallenges(userId);
    const updated = plain(doc);
    updated.status = effectiveStatus(doc, todayKey);
    return json(updated);
  }
);

/**
 * DELETE /api/challenges/[id] — remove the challenge *and* its logs.
 *
 * Both are deleted in the same request (the brief is explicit about this) so
 * a crash between the two cannot leave orphaned logs for a challenge that no
 * longer exists.
 */
export const DELETE = withRoute(
  { limit: "write", params: ["id"] },
  async ({ userId, params }) => {
    const challenge = await loadOwned(userId, params.id);
    await ChallengeLog.deleteMany({ challengeId: challenge._id });
    await Challenge.deleteOne({ _id: challenge._id, userId });

    invalidateChallenges(userId);
    return json({ ok: true });
  }
);
