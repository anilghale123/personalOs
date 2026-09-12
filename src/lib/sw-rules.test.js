import { describe, expect, it, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Tests the **shipped** `public/sw.js`, not a copy of its logic.
 *
 * A service worker is a classic script, so it cannot be imported. Instead the
 * file is evaluated inside a stub worker scope and its internal predicates are
 * handed back. That way these assertions cannot drift from the file that
 * actually runs in users' browsers — which matters most for `isPrivatePath`,
 * where a wrong answer means a user's financial data gets written to Cache
 * Storage and survives sign-out.
 */
let sw;

beforeAll(() => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const swPath = path.join(here, "..", "..", "public", "sw.js");
  const source = readFileSync(swPath, "utf8");

  // A minimal worker global: the file only registers listeners at load time.
  const stubSelf = {
    addEventListener: () => {},
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
    location: { origin: "https://selfview.app" },
  };

  const factory = new Function(
    "self",
    "caches",
    "fetch",
    "Response",
    `${source}
     return {
       isPrivatePath,
       isImmutableAsset,
       NEVER_CACHE,
       CACHE_VERSION,
       OFFLINE_URL,
       PRECACHE,
     };`
  );

  sw = factory(
    stubSelf,
    { open: async () => ({}), keys: async () => [], match: async () => null },
    async () => ({ ok: true, clone: () => ({}) }),
    { error: () => ({}) }
  );
});

describe("isPrivatePath — never cache authenticated pages", () => {
  it("treats every /app route as private", () => {
    // The bug this guards: /app HTML is server-rendered with the user's
    // budget, debts and journal in it. Caching that leaves it readable after
    // sign-out and to the next person on a shared device.
    for (const p of [
      "/app",
      "/app/",
      "/app/today",
      "/app/budget/expenses",
      "/app/journal",
      "/app/portfolio/sip",
      "/app/discoveries/507f1f77bcf86cd799439011",
    ]) {
      expect(sw.isPrivatePath(p), `${p} must be private`).toBe(true);
    }
  });

  it("treats every API route as private", () => {
    for (const p of [
      "/api",
      "/api/budget/expenses",
      "/api/journal/notes",
      "/api/profile",
      "/api/health",
    ]) {
      expect(sw.isPrivatePath(p), `${p} must be private`).toBe(true);
    }
  });

  it("treats auth screens and the admin console as private", () => {
    for (const p of ["/login", "/signup", "/reset-password", "/sysadmin", "/sysadmin/users"]) {
      expect(sw.isPrivatePath(p), `${p} must be private`).toBe(true);
    }
  });

  it("allows genuinely public pages to be cached", () => {
    for (const p of ["/", "/offline.html"]) {
      expect(sw.isPrivatePath(p), `${p} should be cacheable`).toBe(false);
    }
  });

  it("does not over-match paths that merely start with those letters", () => {
    // "/apple-touch-icon.png" begins with "/app" as a substring — a prefix
    // check without a boundary would refuse to cache the app icon.
    expect(sw.isPrivatePath("/apple-touch-icon.png")).toBe(false);
    expect(sw.isPrivatePath("/application.css")).toBe(false);
  });
});

describe("isImmutableAsset", () => {
  it("recognises content-hashed Next.js output", () => {
    expect(sw.isImmutableAsset("/_next/static/chunks/main-abc123.js")).toBe(true);
    expect(sw.isImmutableAsset("/_next/static/css/app.css")).toBe(true);
  });

  it("recognises fonts and images by extension", () => {
    for (const p of [
      "/icon-192.png",
      "/apple-touch-icon.png",
      "/fonts/body.woff2",
      "/art/hero.webp",
      "/favicon.ico",
      "/logo.svg",
    ]) {
      expect(sw.isImmutableAsset(p), `${p} should be immutable`).toBe(true);
    }
  });

  it("does not treat HTML pages or API routes as immutable assets", () => {
    for (const p of ["/", "/app/today", "/api/profile"]) {
      expect(sw.isImmutableAsset(p), `${p} is not an asset`).toBe(false);
    }
  });
});

describe("cache configuration", () => {
  it("precaches the offline page so it exists on first disconnect", () => {
    expect(sw.PRECACHE).toContain(sw.OFFLINE_URL);
    // Must be a plain static file, not a React route that needs JS chunks.
    expect(sw.OFFLINE_URL).toMatch(/.html$/);
  });

  it("declares a cache version, which is what purges older private caches", () => {
    expect(sw.CACHE_VERSION).toMatch(/^v\d+$/);
  });

  it("no private pattern accidentally matches everything", () => {
    // A pattern like /^\// would make the whole site uncacheable and silently
    // disable offline support.
    for (const pattern of sw.NEVER_CACHE) {
      expect(pattern.test("/")).toBe(false);
    }
  });
});
