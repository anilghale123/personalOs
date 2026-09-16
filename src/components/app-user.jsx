"use client";

import * as React from "react";

const AppUserContext = React.createContext(null);

/**
 * Where this device remembers who was signed in.
 *
 * `pos-` prefixed, so `signOutEverywhere` clears it with the rest of the
 * per-device state. It holds a display name and a plan flag — the same three
 * fields the shell renders, and less than the screen snapshots beside it
 * already keep.
 */
const CACHE_KEY = "pos-user";

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const user = JSON.parse(raw);
    return user?.id ? user : null;
  } catch {
    // Storage blocked, or something else wrote nonsense here.
    return null;
  }
}

function writeCache(user) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(user));
  } catch {
    // Private mode. The app still works; it just asks the server each open.
  }
}

function clearCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // Nothing to do.
  }
}

/**
 * The signed-in user for the whole app shell: `{ id, name, isPro }`.
 *
 * ## Why this is resolved here and not on the server
 *
 * The layout used to `await getSession()` and read entitlements before
 * rendering anything. Correct, but it made every route beneath it dynamic —
 * and Next only prefetches a dynamic route *as far as its `loading.jsx`*.
 * That is precisely why switching tabs showed a skeleton: the skeleton was
 * the only part that had been prefetched, and the screen behind it still had
 * to be fetched from the server on every tap. Nothing else could be fixed
 * while the shell read a cookie.
 *
 * Resolving the user on the client instead lets the shell and the tabs be
 * prerendered and prefetched whole, so a tab switch is a local render with no
 * network in the way. The cost is paid once per open, not once per tap, and
 * the remembered copy above means even that is usually invisible.
 *
 * ## This is not the security boundary
 *
 * It never was. Every API route re-reads and re-validates the session in
 * `withRoute`, and every server action resolves its own; the shell knowing a
 * name has no bearing on what data anyone can reach. `src/middleware.js`
 * still bounces a visitor with no session cookie before any of this renders.
 * What is left here is the last case — a cookie that exists but is not valid
 * — and the answer to that is the redirect below.
 */
export function AppUserProvider({ children }) {
  /**
   * `null` until resolved. The shell renders around it either way — chrome
   * with a name still to fill in beats a blank frame — and the screens below
   * wait for an id before they load anything, because their saved copies are
   * filed under it and loading someone's data before knowing whose it is is
   * how a shared device shows the wrong person's numbers.
   */
  const [user, setUser] = React.useState(null);

  React.useEffect(() => {
    let cancelled = false;

    // Paint from what this device remembers, in the same tick as hydration,
    // then confirm it against the server.
    const cached = readCache();
    if (cached) setUser(cached);

    (async () => {
      try {
        const res = await fetch("/api/me");
        if (res.status === 401) {
          clearCache();
          // A cookie that no longer resolves to a session: the middleware let
          // it through because it only checks the cookie exists. A full load
          // rather than a router push, so the stale cookie is re-evaluated
          // from scratch and nothing stale is left in the router cache.
          window.location.replace(
            `/login?next=${encodeURIComponent(window.location.pathname)}`
          );
          return;
        }
        if (!res.ok) throw new Error("Could not load your account.");
        const fresh = await res.json();
        if (cancelled) return;
        writeCache(fresh);
        setUser((held) =>
          held && held.id === fresh.id && held.name === fresh.name && held.isPro === fresh.isPro
            ? held
            : fresh
        );
      } catch {
        // Offline, with or without a remembered user. Nothing to do: the
        // screens below re-read their own data and none of them trust this.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return <AppUserContext.Provider value={user}>{children}</AppUserContext.Provider>;
}

/** @returns {{id: string, name?: string, isPro: boolean} | null} */
export function useAppUser() {
  return React.useContext(AppUserContext);
}
