/**
 * Server-side tracker normalisation for the challenge routes.
 *
 * The builder and the Setup tab both re-send a challenge's tracker tree as a
 * flat list. This module turns that list into the shape the model stores and
 * enforces the edit rules from the brief:
 *
 *   - a tracker added mid-challenge starts its ramp on the current day
 *   - a tracker that has logs is archived when removed, not deleted
 *   - a tracker's metric cannot change once it has logs
 *
 * It stays free of `withRoute` and response concerns: the routes own the
 * session check and the JSON envelope, and this file is plain object math.
 */

import mongoose from "mongoose";
import { badRequest } from "@/lib/api";

function str(v) {
  return v == null ? null : String(v);
}

/** The stored fields common to every tracker, from a normalised item. */
function trackerFields(it) {
  return {
    name: it.name,
    metric: it.metric,
    unit: it.unit ?? null,
    rollup: it.rollup ?? false,
    useSets: it.useSets ?? false,
    baseline: it.baseline ?? null,
    goal: it.goal ?? null,
    rampType: it.rampType ?? "linear",
    direction: it.direction ?? "increase",
    order: it.order ?? 0,
  };
}

/**
 * Turn a flat list of incoming tracker items into stored sub-documents.
 *
 * Each item carries either an `_id` (an existing tracker) or a `key` (a new
 * one). `parentId` references either form, so a single reference map — built
 * up front — resolves every parent pointer, whether it points at something
 * already in the database or at a sibling being created in the same request.
 *
 * @param {object[]} incoming parsed tracker items
 * @param {object} [opts]
 * @param {object[]} [opts.existing] current trackers (edit), or none (create)
 * @param {Set<string>} [opts.loggedIds] tracker ids that appear in a log
 * @param {number} [opts.currentDay] 1-based day for mid-challenge additions
 * @returns {{trackers: object[], errors: string[]}}
 */
export function materializeTrackers(incoming, opts = {}) {
  const { existing = [], loggedIds = new Set(), currentDay = 1 } = opts;
  const existingById = new Map(existing.map((t) => [str(t._id), t]));

  // Pass 1 — assign an id to every item so parent pointers can resolve.
  const idFor = new Map(); // key or _id string -> id string
  const newIds = new Map(); // item -> fresh id
  for (const it of incoming) {
    if (it._id) {
      idFor.set(str(it._id), str(it._id));
    } else if (it.key) {
      const id = new mongoose.Types.ObjectId().toHexString();
      newIds.set(it, id);
      idFor.set(String(it.key), id);
    }
  }

  const trackers = [];
  const errors = [];
  const seen = new Set();

  for (const it of incoming) {
    const id = it._id ? str(it._id) : newIds.get(it);
    if (seen.has(id)) {
      errors.push(`${it.name}: the same item appears more than once.`);
      continue;
    }
    seen.add(id);

    // Parent pointer. null/absent is a top-level habit; anything else must
    // resolve to a tracker in this list.
    let parentId = null;
    if (it.parentId != null && it.parentId !== "") {
      parentId = idFor.get(str(it.parentId));
      if (!parentId) {
        errors.push(`${it.name}: its parent is not in this list.`);
        continue;
      }
    }

    const isNew = !it._id;
    const ex = it._id ? existingById.get(str(it._id)) : null;
    if (it._id && !ex) {
      errors.push(`${it.name}: an item to edit does not belong to this challenge.`);
      continue;
    }

    // A metric change rewrites what every past log means, so it is blocked
    // once anything is logged — archive and add a new one instead.
    if (ex && ex.metric !== it.metric && loggedIds.has(str(ex._id))) {
      errors.push(
        `${ex.name}: you can't change its type after logging it. Archive it and add a new one.`
      );
      continue;
    }

    const startDay = isNew
      ? it.startDay ?? currentDay
      : it.startDay ?? ex.startDay ?? 1;

    trackers.push({
      _id: id,
      parentId,
      ...trackerFields(it),
      startDay,
      archived: it.archived ?? ex?.archived ?? false,
    });
  }

  // Trackers present before but absent now. One with logs is archived (its
  // history must survive); one without is simply gone.
  for (const ex of existing) {
    if (seen.has(str(ex._id))) continue;
    if (loggedIds.has(str(ex._id))) {
      trackers.push({
        _id: str(ex._id),
        parentId: str(ex.parentId),
        ...trackerFields(ex),
        startDay: ex.startDay ?? 1,
        archived: true,
      });
    }
  }

  return { trackers, errors };
}

/** Throw a 400 listing the first few materialisation errors, if any. */
export function assertNoErrors(errors) {
  if (errors.length) {
    throw badRequest(errors.slice(0, 3).join(" "));
  }
}
