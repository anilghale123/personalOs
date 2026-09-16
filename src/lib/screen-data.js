"use client";

import * as React from "react";
import { readSnapshot, sameData, writeSnapshot } from "@/lib/snapshot";

/**
 * The app's client cache policy: **cache first, refetched when you write.**
 *
 * ## The rule
 *
 * Opening a screen you have opened before costs nothing. Not a skeleton, not
 * a request — the copy on the device is rendered as-is and that is the end of
 * it. A screen re-reads the server in exactly three situations:
 *
 *   1. it has never been opened on this device (the only time a placeholder
 *      is ever shown),
 *   2. something was created, changed or deleted that this screen shows —
 *      `invalidateScreens` below, called from the write paths, and
 *   3. the copy has gone past `STALE_AFTER_MS` and the screen is being
 *      opened fresh, or the app has just come back to the foreground.
 *
 * ## Why (3) exists at all
 *
 * (1) and (2) alone would mean a device that makes no changes never sees any
 * — and plenty here changes without anyone touching it: NEPSE prices arrive
 * from a cron, the weekly briefing is written server-side, and a second
 * device edits the same account. Without a backstop a phone could show a
 * portfolio priced weeks ago and be certain it was right. That is not a
 * trade worth making in an app about money.
 *
 * It costs nothing visible. A refetch behind a rendered screen swaps in
 * quietly, or changes nothing at all and re-renders nothing. It never
 * produces a loading state, because there is already something on screen.
 * Switching tabs stays free: the window is far longer than any tab switch.
 *
 * ## Two layers under it
 *
 * `memory` is what this session has already seen — moving away and back does
 * not even reach storage. Under it sits the device's saved copy, which is
 * what makes the first open of a *session* instant too. Objects are kept by
 * identity, so a refetch that found nothing new re-renders nothing.
 */

/** How old a copy may be before opening a screen re-reads it. */
const STALE_AFTER_MS = 5 * 60 * 1000;

/** What this session has already loaded, by `userId:key`. */
const memory = new Map();
/** When each was last read from the server. */
const fetchedAt = new Map();
/** Entries a write has invalidated, waiting for their screen to open. */
const dirty = new Set();
/** Re-render callbacks, by cache key. */
const listeners = new Map();
/** Background refetches for screens currently on screen, by cache key. */
const refreshers = new Map();

function publish(cacheKey, data) {
  memory.set(cacheKey, data);
  listeners.get(cacheKey)?.forEach((notify) => notify());
}

/** `userId:key` — user ids are hex, so the first colon always splits it. */
function keyOf(cacheKey) {
  return cacheKey.slice(cacheKey.indexOf(":") + 1);
}

/**
 * Does `cacheKey` belong to `target`?
 *
 * Prefix matching, so `invalidateScreens("planner")` reaches every week
 * saved under `planner:<week>` without the caller having to know which
 * weeks this device happens to hold.
 */
function covers(cacheKey, target) {
  const key = keyOf(cacheKey);
  return key === target || key.startsWith(`${target}:`);
}

/**
 * Mark screens as out of date after a write.
 *
 * Call this from wherever something is created, changed or deleted, naming
 * what the change affects. Screens on the display re-read straight away, in
 * the background — what is already rendered stays rendered, so this never
 * shows a placeholder. Screens not currently open are simply marked, and
 * re-read the next time they are opened.
 *
 * `"home"` is added to every call: the briefing on the home screen is drawn
 * from expenses, goals, habits and the journal alike, so there is no write
 * in this app that leaves it untouched.
 *
 * @param {...string} keys screen keys, or a prefix like `"planner"`
 */
export function invalidateScreens(...keys) {
  const targets = new Set([...keys, "home"]);
  for (const cacheKey of new Set([...memory.keys(), ...refreshers.keys()])) {
    if (![...targets].some((target) => covers(cacheKey, target))) continue;
    const live = refreshers.get(cacheKey);
    if (live?.size) {
      live.forEach((refresh) => refresh());
    } else {
      dirty.add(cacheKey);
    }
  }
}

/** Drop everything held for a user — called when signing out. */
export function clearScreenData() {
  memory.clear();
  fetchedAt.clear();
  dirty.clear();
}

/**
 * @param {string|null|undefined} userId
 * @param {string} key      snapshot key, unique per screen
 * @param {string|null} url endpoint to read from; null to never fetch
 * @returns {{data: any, failed: boolean}} `data` is null only when this
 *   screen has never been opened on this device
 */
export function useScreenData(userId, key, url) {
  const cacheKey = userId ? `${userId}:${key}` : null;
  const [failed, setFailed] = React.useState(false);

  const subscribe = React.useCallback(
    (notify) => {
      if (!cacheKey) return () => {};
      let set = listeners.get(cacheKey);
      if (!set) listeners.set(cacheKey, (set = new Set()));
      set.add(notify);
      return () => set.delete(notify);
    },
    [cacheKey]
  );

  /**
   * Called during render, so it must be cheap and must return the same
   * object every time until something actually changes — hence reading
   * storage once and holding the result in `memory`.
   *
   * Reading here rather than in an effect is the whole point: effects run
   * after the browser paints, so a screen whose copy was sitting on the
   * device still flashed a placeholder before showing it.
   */
  const getSnapshot = React.useCallback(() => {
    if (!cacheKey) return null;
    if (!memory.has(cacheKey)) {
      memory.set(cacheKey, readSnapshot(userId, key) ?? null);
    }
    return memory.get(cacheKey);
  }, [cacheKey, userId, key]);

  // The build has no device to read, and saying so is what keeps hydration
  // matching the HTML it shipped.
  const getServerSnapshot = React.useCallback(() => null, []);

  const data = React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );

  React.useEffect(() => {
    if (!cacheKey || !url) return undefined;
    let cancelled = false;

    async function refresh() {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Could not load ${url}`);
        const fresh = await res.json();
        if (cancelled) return;
        fetchedAt.set(cacheKey, Date.now());
        dirty.delete(cacheKey);
        writeSnapshot(userId, key, fresh);
        setFailed(false);
        // Nothing changed: keep the object we have, and re-render nothing.
        if (!sameData(memory.get(cacheKey), fresh)) publish(cacheKey, fresh);
      } catch {
        // With something already on screen this is not worth reporting —
        // what is shown is the user's own data, just a little older.
        if (!cancelled) setFailed(true);
      }
    }

    // Stay reachable while mounted, so a write elsewhere refreshes this
    // where it stands instead of waiting for it to be opened again.
    let live = refreshers.get(cacheKey);
    if (!live) refreshers.set(cacheKey, (live = new Set()));
    live.add(refresh);

    const age = Date.now() - (fetchedAt.get(cacheKey) ?? 0);
    const needsRead =
      memory.get(cacheKey) == null || dirty.has(cacheKey) || age > STALE_AFTER_MS;
    if (needsRead) refresh();

    /** Coming back to the app is the moment a stale copy matters most. */
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - (fetchedAt.get(cacheKey) ?? 0) > STALE_AFTER_MS) refresh();
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      live.delete(refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [cacheKey, userId, key, url]);

  return { data, failed };
}

/**
 * Whether a screen that keeps its own cache should re-read the server.
 *
 * The budget, planner and journal stores predate this module and hold data
 * that is edited in place, so they cannot simply be replaced by
 * `useScreenData` — but they follow the same rule, and this is how they ask
 * about it. Returns true when there is nothing cached, when a write marked
 * it, or when the copy has gone stale.
 *
 * @param {string|null|undefined} userId
 * @param {string} key
 * @param {boolean} hasCopy whether the caller already has something to show
 */
export function shouldRead(userId, key, hasCopy) {
  if (!userId) return false;
  const cacheKey = `${userId}:${key}`;
  if (!hasCopy) return true;
  if (dirty.has(cacheKey)) return true;
  return Date.now() - (fetchedAt.get(cacheKey) ?? 0) > STALE_AFTER_MS;
}

/** Record that a self-caching screen has just re-read `key`. */
export function markRead(userId, key) {
  if (!userId) return;
  const cacheKey = `${userId}:${key}`;
  fetchedAt.set(cacheKey, Date.now());
  dirty.delete(cacheKey);
  // So `invalidateScreens` can find it even though nothing is stored here.
  if (!memory.has(cacheKey)) memory.set(cacheKey, null);
}
