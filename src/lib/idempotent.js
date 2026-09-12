/**
 * Idempotent appends to a subdocument array.
 *
 * The problem this solves is specific and was silent: contributions, debt
 * entries and SIP installments were blind `$push`, so a double-tap on a
 * slow connection, a browser retry, or an optimistic-UI resubmit posted the
 * same payment twice. Because balances are *derived* by summing the array,
 * the wrong balance then became the stored truth — and nothing in the
 * schema could tell a duplicate apart from two genuine identical payments
 * afterwards.
 *
 * The fix is one atomic write, not a read-then-write:
 *
 *   { _id, userId, "entries.idempotencyKey": { $ne: key } }
 *
 * If the key is already in the array the filter does not match, nothing is
 * pushed, and no lock or transaction is involved. Two simultaneous replays
 * both fail the filter; exactly one original succeeds.
 *
 * A non-match is ambiguous — wrong owner, missing parent, or a replay — so
 * `appendOnce` resolves it with a follow-up read and reports which it was,
 * letting the route answer a replay with the current state (a success, as
 * far as the caller is concerned) and a genuinely missing parent with 404.
 */

/**
 * Hard ceiling on entries in one subdocument array.
 *
 * These arrays live inside their parent document, so they carry three costs
 * that grow with length: every read of a debt loads its whole ledger, every
 * `$push` rewrites the whole document, and MongoDB's 16MB document limit is a
 * wall with no graceful degradation behind it.
 *
 * The proper fix is separate collections, which is a migration rather than a
 * guard. Until then this refuses the write with a clear message instead of
 * letting someone silently approach a limit that fails as data loss. 2,000
 * entries is roughly five years of daily repayments — far beyond real use, and
 * far below anything that threatens the document limit.
 */
export const MAX_SUBDOCUMENT_ENTRIES = 2000;

/**
 * @template T
 * @param {import('mongoose').Model<T>} Model
 * @param {object} options
 * @param {object} options.filter must already scope by userId — ownership
 *   and existence are the same check, which is what keeps IDOR impossible
 * @param {string} options.arrayPath e.g. 'entries' or 'contributions'
 * @param {object} options.entry the subdocument to append
 * @param {string} [options.idempotencyKey]
 * @param {object} [options.alsoSet] fields to $set alongside the push
 * @returns {Promise<{doc: T|null, replayed: boolean, atCapacity?: boolean}>}
 */
export async function appendOnce(
  Model,
  { filter, arrayPath, entry, idempotencyKey, alsoSet }
) {
  const guardedFilter = {
    ...filter,
    // Enforced in the same atomic write as the push, so two concurrent appends
    // cannot both pass a separately-read length check.
    $expr: {
      $lt: [
        { $size: { $ifNull: [`$${arrayPath}`, []] } },
        MAX_SUBDOCUMENT_ENTRIES,
      ],
    },
  };
  if (idempotencyKey) {
    guardedFilter[`${arrayPath}.idempotencyKey`] = { $ne: idempotencyKey };
  }

  const update = {
    $push: { [arrayPath]: { ...entry, ...(idempotencyKey ? { idempotencyKey } : {}) } },
    ...(alsoSet ? { $set: alsoSet } : {}),
  };

  const doc = await Model.findOneAndUpdate(guardedFilter, update, {
    new: true,
    runValidators: true,
  }).lean();

  if (doc) return { doc, replayed: false };

  /**
   * The write did not apply, and there are three possible reasons. Resolving
   * which one matters: a replay must read as success, a full array needs its
   * own message, and a missing parent is a 404.
   */
  const existing = await Model.findOne(filter).lean();
  if (!existing) return { doc: null, replayed: false };

  if (idempotencyKey) {
    const alreadyThere = (existing[arrayPath] ?? []).some(
      (item) => item?.idempotencyKey === idempotencyKey
    );
    if (alreadyThere) return { doc: existing, replayed: true };
  }

  if ((existing[arrayPath] ?? []).length >= MAX_SUBDOCUMENT_ENTRIES) {
    return { doc: existing, replayed: false, atCapacity: true };
  }

  // Parent exists, not a replay, not full — the filter matched nothing for a
  // reason we do not model, so report it as not-found rather than guess.
  return { doc: null, replayed: false };
}

/**
 * Remove one subdocument by `_id`, scoped to its parent.
 *
 * Included here so deletion mirrors the append: one atomic `$pull` against
 * an owner-scoped filter, never a read-modify-save that could clobber a
 * concurrent append to the same array.
 *
 * @template T
 * @param {import('mongoose').Model<T>} Model
 * @param {object} options
 * @param {object} options.filter owner-scoped parent filter
 * @param {string} options.arrayPath
 * @param {string} options.entryId
 * @returns {Promise<T|null>}
 */
export async function pullById(Model, { filter, arrayPath, entryId }) {
  return Model.findOneAndUpdate(
    { ...filter, [`${arrayPath}._id`]: entryId },
    { $pull: { [arrayPath]: { _id: entryId } } },
    { new: true }
  ).lean();
}
