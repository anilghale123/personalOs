/**
 * Per-user read caching, with tag-based invalidation.
 *
 * The app previously cached nothing: all thirteen pages declared
 * `force-dynamic`, so every visit to `/app/today` re-ran five queries
 * including a full year of habit logs. That is the main source of the
 * slowness.
 *
 * ## Two tiers, and the distinction is load-bearing
 *
 * **Tier 1 — derived money.** Budget summaries, expense totals, debt
 * balances, portfolio values. These are cached **only** with a tag that the
 * mutating route invalidates, never with a time-based TTL. A stale balance is
 * worse than a slow one: a user who logs an expense and sees an unchanged
 * total does not think "cache lag", they think the app lost their money, and
 * they are right not to trust it. `revalidateTag` runs in the same request
 * that performed the write, so the next read cannot see the old value.
 *
 * The `revalidate` on these entries is a backstop against a *missed*
 * invalidation, not the invalidation mechanism. It is set long precisely so
 * that a forgotten `revalidateTag` shows up as an obvious bug rather than
 * being masked by a short expiry.
 *
 * **Tier 2 — slow-moving reference data.** Category lists, stock prices,
 * readiness coverage, AI narrations. A short TTL is fine here because being
 * a minute out of date changes no decision.
 *
 * Every cache key includes the user id. A cache entry that could be served
 * across users would be a data-leak bug, not a performance bug, so the user
 * id is part of the key material rather than only the tag.
 */

import { unstable_cache } from "next/cache";
import { revalidateTag } from "next/cache";

/** Tier-1 backstop: long, because tags do the real work. */
const MONEY_BACKSTOP_SECONDS = 60 * 60;
/** Tier-2 default. */
const REFERENCE_SECONDS = 5 * 60;

/**
 * Cache tags, namespaced per user.
 *
 * Always build tags through these helpers — a hand-written tag string that
 * disagrees with the one the invalidator uses produces a cache that never
 * clears, which is the failure mode this whole module exists to avoid.
 */
export const tags = {
  /** Everything money-derived for one user. The blunt instrument. */
  money: (userId) => `u:${userId}:money`,
  expenses: (userId) => `u:${userId}:expenses`,
  budgets: (userId) => `u:${userId}:budgets`,
  categories: (userId) => `u:${userId}:categories`,
  debts: (userId) => `u:${userId}:debts`,
  goals: (userId) => `u:${userId}:goals`,
  portfolio: (userId) => `u:${userId}:portfolio`,
  habits: (userId) => `u:${userId}:habits`,
  journal: (userId) => `u:${userId}:journal`,
  planner: (userId) => `u:${userId}:planner`,
  insights: (userId) => `u:${userId}:insights`,
  signals: (userId) => `u:${userId}:signals`,
  profile: (userId) => `u:${userId}:profile`,
};

/**
 * Cache a **money-derived** read.
 *
 * @template T
 * @param {() => Promise<T>} fn the uncached computation
 * @param {object} options
 * @param {string} options.userId
 * @param {string} options.key stable name for this computation
 * @param {string[]} options.deps extra key material — period, date, filters
 * @param {string[]} options.tags tags that invalidate this entry
 * @returns {Promise<T>}
 */
export function cachedMoney(fn, { userId, key, deps = [], tags: entryTags }) {
  if (!userId) throw new Error("cachedMoney requires a userId in the key.");
  return unstable_cache(fn, [`money`, key, String(userId), ...deps.map(String)], {
    tags: entryTags,
    revalidate: MONEY_BACKSTOP_SECONDS,
  })();
}

/**
 * Cache a slow-moving **reference** read on a short TTL.
 *
 * @template T
 * @param {() => Promise<T>} fn
 * @param {object} options
 * @param {string} options.userId
 * @param {string} options.key
 * @param {string[]} [options.deps]
 * @param {string[]} [options.tags]
 * @param {number} [options.seconds]
 * @returns {Promise<T>}
 */
export function cachedReference(
  fn,
  { userId, key, deps = [], tags: entryTags = [], seconds = REFERENCE_SECONDS }
) {
  if (!userId) throw new Error("cachedReference requires a userId in the key.");
  return unstable_cache(fn, [`ref`, key, String(userId), ...deps.map(String)], {
    tags: entryTags,
    revalidate: seconds,
  })();
}

/**
 * Invalidate tags after a write.
 *
 * Call this in the same request as the mutation, before responding, so the
 * client's follow-up read cannot observe the old value. Accepts tag strings
 * already built via `tags.*`.
 *
 * @param {...string} tagNames
 */
export function invalidate(...tagNames) {
  for (const tag of tagNames.flat().filter(Boolean)) {
    revalidateTag(tag);
  }
}

/**
 * Everything a money write can affect.
 *
 * Expense, budget and category changes all feed the same summaries, so they
 * share one invalidation set. Being slightly broad here is deliberate: a
 * missed invalidation shows wrong money, while an unnecessary one only costs
 * one recomputation.
 *
 * @param {string} userId
 */
export function invalidateMoney(userId) {
  invalidate(
    tags.money(userId),
    tags.expenses(userId),
    tags.budgets(userId),
    tags.categories(userId),
    tags.debts(userId),
    tags.goals(userId),
    // The pattern engine reads spend as a signal.
    tags.signals(userId)
  );
}

/** Everything a portfolio or SIP write affects. */
export function invalidatePortfolio(userId) {
  invalidate(tags.portfolio(userId), tags.money(userId));
}

/** Journal and quick-note writes. */
export function invalidateJournal(userId) {
  invalidate(tags.journal(userId), tags.signals(userId));
}

/** Habit and goal writes. */
export function invalidateHabits(userId) {
  invalidate(tags.habits(userId), tags.signals(userId));
}

/** Planner writes. */
export function invalidatePlanner(userId) {
  invalidate(tags.planner(userId), tags.signals(userId));
}
