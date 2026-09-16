/**
 * Saved copies of screen data on this device — what lets a screen paint
 * instantly with what it showed last time, while the real request runs.
 *
 * Every copy is a stand-in, never the truth: each screen re-reads the server
 * straight after painting from it and swaps in the result if anything
 * changed. That is what makes it safe for money screens too.
 *
 * Two privacy properties are load-bearing:
 *   - Keys carry the user id, so one account can never be shown another's
 *     saved data on a shared device.
 *   - Keys start with `pos-`, which `signOutEverywhere` already clears.
 */

const PREFIX = "pos-snap:v1:";

/** Older than this and a copy is thrown away rather than shown. */
export const SNAPSHOT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

function storageKey(userId, key) {
  return `${PREFIX}${userId}:${key}`;
}

function storage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    // Storage blocked (private mode, site data disabled).
    return null;
  }
}

/**
 * The saved copy for `key`, or undefined.
 * @param {string|null|undefined} userId
 * @param {string} key
 */
export function readSnapshot(userId, key) {
  const store = storage();
  if (!userId || !store) return undefined;
  const name = storageKey(userId, key);
  try {
    const raw = store.getItem(name);
    if (!raw) return undefined;
    const { at, data } = JSON.parse(raw);
    if (!at || Date.now() - at > SNAPSHOT_MAX_AGE_MS) {
      store.removeItem(name);
      return undefined;
    }
    return data;
  } catch {
    return undefined;
  }
}

/**
 * Save `data` as the copy for `key`. Best effort: a full or blocked storage
 * never breaks the screen, it only means the next open waits for the network.
 */
export function writeSnapshot(userId, key, data) {
  const store = storage();
  if (!userId || !store || data === undefined) return;
  const name = storageKey(userId, key);
  const value = JSON.stringify({ at: Date.now(), data });
  try {
    store.setItem(name, value);
  } catch {
    // Most likely over quota — drop every saved copy and try once more.
    try {
      clearSnapshots();
      store.setItem(name, value);
    } catch {
      // Still no room; skip saving.
    }
  }
}

/** Remove every saved copy on this device, for every user. */
export function clearSnapshots() {
  const store = storage();
  if (!store) return;
  try {
    const names = [];
    for (let i = 0; i < store.length; i++) {
      const name = store.key(i);
      if (name?.startsWith(PREFIX)) names.push(name);
    }
    names.forEach((name) => store.removeItem(name));
  } catch {
    // Nothing to do.
  }
}

/**
 * A list from a saved copy, or an empty one.
 *
 * Saved copies come back from `localStorage`, which means they can be
 * anything: written by an older version of the app with a different shape,
 * truncated by a quota error mid-write, or edited by hand. Rendering
 * `saved.rows.map(...)` against one of those throws, and a throw during
 * render is the "Application error" screen — on every open, because the bad
 * copy is still there the next time too.
 *
 * So nothing trusts the shape of what comes back. A copy that is not what
 * the screen expects is treated as no copy at all, which costs one fetch and
 * never costs a crash.
 */
export function asList(value) {
  return Array.isArray(value) ? value : [];
}

/** The same, for a saved copy expected to be a plain object. */
export function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

/**
 * Whether two payloads carry the same data — so a refresh that changed
 * nothing keeps the existing objects and re-renders nothing.
 */
export function sameData(a, b) {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}
