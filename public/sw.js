/**
 * selfView service worker.
 *
 * Two jobs: make the app installable (Chromium requires a fetch handler), and
 * make it usable without a connection.
 *
 * ## The rule that shapes everything here: never cache private pages
 *
 * Pages under /app are server-rendered with the signed-in user's financial
 * data in the HTML. The previous version cached *every* navigation, so a
 * user's budget and journal ended up sitting in Cache Storage — readable after
 * sign-out, and on a shared device readable by the next person to open the
 * app. Offline convenience is not worth that.
 *
 * So: static assets and public pages are cached; authenticated HTML and every
 * API response are passed straight through to the network and, when that
 * fails, answered with the offline page. The app shell still loads instantly
 * offline because the shell *is* static assets.
 *
 * Bumping CACHE_VERSION deletes every older cache on activate, which is also
 * how any privately-cached page from a previous version gets purged.
 */

// v8: purges `/_next/static` chunks cached from `next dev`, whose URLs are
// not content-hashed — a stale cached chunk caused hydration mismatches.
// v9: new app icons. Icons are cached forever under the same URLs, so without
// a bump installed apps would keep showing the old ones.
const CACHE_VERSION = "v9";
const STATIC_CACHE = `selfview-static-${CACHE_VERSION}`;
const PAGE_CACHE = `selfview-pages-${CACHE_VERSION}`;
/**
 * A plain static HTML file, not a Next.js route.
 *
 * A React page cannot serve as the offline fallback: its HTML needs JS chunks
 * to hydrate, and those chunks are not in the cache unless the user happened
 * to visit that route while online. Serving it offline produced "Application
 * error: a client-side exception has occurred" on every navigation. This file
 * has inline styles, no chunks and no hydration, so it renders anywhere.
 */
const OFFLINE_URL = "/offline.html";

/** Precached so the offline page is available on the very first disconnect. */
const PRECACHE = [OFFLINE_URL, "/icon-192.png", "/icon-512.png"];

/**
 * Paths whose responses must never be written to a cache.
 *
 * `/app`  — server-rendered private data
 * `/api`  — private data, and caching a mutation response is never right
 * `/login`, `/signup`, `/reset-password` — carry CSRF tokens and one-time
 *          state; a cached copy can be stale in a way that breaks sign-in
 */
const NEVER_CACHE = [
  /^\/app(\/|$)/,
  /^\/api(\/|$)/,
  // The admin console lists real people and their activity.
  /^\/sysadmin(\/|$)/,
  /^\/login/,
  /^\/signup/,
  /^\/reset-password/,
];

function isPrivatePath(pathname) {
  return NEVER_CACHE.some((pattern) => pattern.test(pathname));
}

/**
 * A local development origin.
 *
 * `next dev` serves chunks at stable, un-hashed URLs
 * (`/_next/static/chunks/app/layout.js`) whose contents change on every edit.
 * Caching them cache-first meant the browser kept running old component code
 * against freshly server-rendered HTML — a hydration mismatch after every
 * change. Locally the worker stays out of the way entirely.
 */
function isDevHost(hostname = self.location.hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/** Next.js build output — content-hashed, so safe to cache forever. */
function isImmutableAsset(pathname) {
  return (
    pathname.startsWith("/_next/static/") ||
    /\.(?:woff2?|ttf|otf|png|jpg|jpeg|svg|webp|ico|avif)$/i.test(pathname)
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      // Individually, so one 404 cannot fail the whole install and leave the
      // worker unregistered.
      await Promise.allSettled(PRECACHE.map((url) => cache.add(url)));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([STATIC_CACHE, PAGE_CACHE]);
      const keys = await caches.keys();
      // Also what purges privately-cached pages left by an older version.
      await Promise.all(
        keys.filter((key) => !keep.has(key)).map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

/**
 * Sign-out has to wipe the caches.
 *
 * Even though private pages are never cached, a public page can still carry
 * the user's name, and the next person on a shared device should start clean.
 * The client posts this from its sign-out handler.
 */
self.addEventListener("message", (event) => {
  if (event.data?.type !== "CLEAR_CACHES") return;
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      // Re-seed the offline page so the app stays usable offline afterwards.
      const cache = await caches.open(STATIC_CACHE);
      await Promise.allSettled(PRECACHE.map((url) => cache.add(url)));
      event.source?.postMessage?.({ type: "CACHES_CLEARED" });
    })()
  );
});

/**
 * Daily reminders (see src/features/reminders). The payload is built on the
 * server; this only displays it. `tag` makes a newer reminder replace an
 * unread older one instead of stacking.
 */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { body: event.data?.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "selfView", {
      body: data.body,
      icon: "/icon-192.png",
      // Android draws the status-bar badge from the alpha channel only, so
      // it needs a transparent silhouette, not the full-colour icon.
      badge: "/badge-96.png",
      tag: data.tag || "selfview",
      data: { url: data.url || "/app" },
    })
  );
});

/** Tapping a reminder focuses an open window, or opens one, at its screen. */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  let target = new URL(event.notification.data?.url || "/app", self.location.origin);
  // Only ever navigate within our own origin.
  if (target.origin !== self.location.origin) {
    target = new URL("/app", self.location.origin);
  }

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const open = windows.find(
        (client) => new URL(client.url).origin === self.location.origin
      );
      if (open) {
        await open.focus();
        if ("navigate" in open) await open.navigate(target.href).catch(() => {});
        return;
      }
      await self.clients.openWindow(target.href);
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Never interfere with writes — a cached POST response is always wrong.
  if (request.method !== "GET") return;

  // Local development: always the network, never a cached chunk.
  if (isDevHost()) return;

  const url = new URL(request.url);

  // Only handle our own origin. Cross-origin requests (fonts, CDNs) are the
  // browser's business and the CSP already governs them.
  if (url.origin !== self.location.origin) return;

  /**
   * The offline page itself, always from cache and ignoring its query string.
   *
   * It is requested as `/offline.html?from=/app/today`, but cached under the
   * bare path — and `caches.match` compares the full URL including the query.
   * Without `ignoreSearch` the lookup missed, which sent the request back
   * through the offline fallback a second time and dropped the `from`
   * parameter, so "Try again" always went to the dashboard instead of where
   * the user had actually been headed.
   */
  if (url.pathname === OFFLINE_URL) {
    event.respondWith(
      caches
        .match(OFFLINE_URL, { ignoreSearch: true })
        .then((cached) => cached ?? fetch(request))
    );
    return;
  }

  /* ---- immutable assets: cache-first ------------------------------- */
  if (isImmutableAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  /* ---- private routes: network-only, offline page as the fallback --- */
  if (isPrivatePath(url.pathname)) {
    if (request.mode === "navigate") {
      event.respondWith(networkOnlyWithOfflinePage(request));
    }
    // Non-navigation private requests (API calls) are left entirely alone, so
    // a failure surfaces to the app as a real network error it can report.
    return;
  }

  /* ---- public pages: network-first, cached copy when offline -------- */
  if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(request));
  }
});

/**
 * Send a failed navigation to the offline page.
 *
 * A **redirect**, not the offline page's HTML served under the requested URL.
 * That distinction is the whole fix: this app is a Next.js App Router site, so
 * every page's HTML carries route data for the URL it was built for. Returning
 * /offline's HTML at /app/today made the client router try to hydrate a
 * mismatched route, and every offline navigation died with "Application error:
 * a client-side exception has occurred" instead of showing anything.
 *
 * Redirecting means the browser requests /offline properly, this worker serves
 * the cached copy for its own URL, and hydration matches.
 *
 * `?from=` carries where the user was trying to go, so "Try again" can return
 * them there rather than dumping them at the root.
 */
async function offlineRedirect(request) {
  const cached = await caches.match(OFFLINE_URL);

  // Without a cached offline page a redirect would loop, so answer inline.
  if (!cached) {
    return new Response(
      "<!doctype html><meta charset=utf-8><title>Offline</title>" +
        "<body style=\"font-family:system-ui;padding:3rem;text-align:center\">" +
        "<h1>You're offline</h1><p>selfView needs a connection to load this page.</p>",
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  const from = new URL(request.url).pathname;
  const target = new URL(OFFLINE_URL, self.location.origin);
  if (from && from !== OFFLINE_URL) target.searchParams.set("from", from);

  return Response.redirect(target.toString(), 302);
}

/** Serve from cache, falling back to network and filling the cache. */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // A missing asset offline is better as a failed request than a fake 200.
    return Response.error();
  }
}

/**
 * Public page: try the network, cache what comes back, fall back to the cached
 * copy and then the offline page.
 */
async function networkFirstPage(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(PAGE_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // A cached copy of *this* URL is safe to serve — its embedded route data
    // matches the address bar, so it hydrates correctly.
    const cached = await caches.match(request);
    if (cached) return cached;
    return offlineRedirect(request);
  }
}

/**
 * Private page: always the network, never cached. Offline gets the offline
 * page rather than the browser's error, which at least explains itself.
 */
async function networkOnlyWithOfflinePage(request) {
  try {
    return await fetch(request);
  } catch {
    return offlineRedirect(request);
  }
}
