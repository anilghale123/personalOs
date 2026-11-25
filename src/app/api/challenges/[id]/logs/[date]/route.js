import { withRoute, json, must, badRequest } from "@/lib/api";
import { plain } from "@/lib/serialize";
import { invalidateChallenges } from "@/lib/cache";
import Challenge from "@/models/Challenge";
import ChallengeLog from "@/models/ChallengeLog";
import { isDateInRange, targetFor } from "@/features/challenge/utils";
import { SaveLog } from "@/features/challenge/schemas";

/**
 * PUT /api/challenges/[id]/logs/[date]
 *
 * Upserts one whole day of entries. This is the workhorse write of the
 * feature, so it does the things the brief lists and the client cannot be
 * trusted to do:
 *
 *   - the date must fall inside the challenge and not be in the future
 *   - `dayNumber` is computed here, never taken from the client
 *   - every `trackerId` must exist, not be archived, and be directly
 *     loggable (a rollup's value is derived, so it is never stored)
 *   - negatives and empty set lists are dropped; a set tracker's value is
 *     re-derived as the sum of its sets
 *   - each entry's `target` is snapshotted from the ramp at that day
 *   - a tracker's first-ever value calibrates its baseline, in the same
 *     request as the log
 *
 * The upsert is on the (challengeId, date) unique index, so a double-tap
 * races into the index instead of appending a second day document.
 */
export const PUT = withRoute(
  { limit: "write", params: ["id", "date"], body: SaveLog },
  async ({ userId, params, input }) => {
    const { id, date } = params;
    const challenge = must(await Challenge.findOne({ _id: id, userId }).lean());
    const todayKey = new Date().toISOString().slice(0, 10);

    if (!isDateInRange(challenge, date, todayKey)) {
      throw badRequest("That date is not in this challenge or is in the future.");
    }
    // Day number from the calendar difference — 'YYYY-MM-DD' keys are UTC
    // midnight, so the integer day diff is exact.
    const dayNumber =
      Math.round(
        (new Date(`${date}T00:00:00Z`) - new Date(`${challenge.startDate}T00:00:00Z`)) /
          86400000
      ) + 1;

    const byTracker = new Map(challenge.trackers.map((t) => [String(t._id), t]));
    const entries = [];
    const calibrations = {};

    for (const raw of input.entries) {
      const tracker = byTracker.get(raw.trackerId);
      if (!tracker) continue; // an unknown tracker is ignored, not an error
      if (tracker.archived || tracker.rollup) {
        throw badRequest(`${tracker.name} can't be logged directly.`);
      }

      let value = null;
      let sets = null;
      let done = false;

      if (tracker.metric === "check") {
        done = Boolean(raw.done);
        value = done ? 1 : 0;
      } else if (tracker.useSets) {
        // Drop negatives and empties; the value is the sum of what remains.
        sets = (raw.sets || []).filter((n) => Number.isFinite(n) && n >= 0);
        if (sets.length === 0) sets = null;
        value = sets ? sets.reduce((a, b) => a + b, 0) : null;
      } else {
        const v = raw.value;
        value = v != null && Number.isFinite(v) && v >= 0 ? v : null;
      }

      // A tracker with nothing to record is left out of the day entirely.
      if (value == null && !done) continue;

      const target = targetFor(challenge, tracker, dayNumber);
      entries.push({ trackerId: tracker._id, value, sets, done, target });

      // A tracker's first-ever value calibrates its baseline, if it has none.
      if (tracker.baseline == null && value != null) {
        calibrations[`trackers.${tracker._id}.baseline`] = value;
      }
    }

    const log = {
      userId,
      challengeId: challenge._id,
      date,
      dayNumber,
      entries,
      note: input.note ?? null,
    };

    const saved = await ChallengeLog.findOneAndUpdate(
      { challengeId: challenge._id, date },
      log,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    must(saved);

    // Baseline calibrations land in the same request as the log.
    if (Object.keys(calibrations).length) {
      await Challenge.updateOne({ _id: challenge._id, userId }, { $set: calibrations });
    }

    invalidateChallenges(userId);
    return json(plain(saved));
  }
);
