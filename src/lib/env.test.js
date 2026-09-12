import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Regression tests for the production outage.
 *
 * `assertEnv()` threw from the root layout, which wraps every route, so one
 * wrong environment variable returned 500 for the entire site — landing page,
 * login, and `/api/health` included, meaning the endpoint you would check to
 * diagnose it was also down.
 *
 * Two properties keep that from recurring: the layout's entry point must never
 * throw, and severity must match blast radius.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(path.join(here, "..", "..", rel), "utf8");

describe("the root layout can never be taken down by configuration", () => {
  it("calls reportEnv, never assertEnv", () => {
    // assertEnv throws by design; calling it from the layout is the bug.
    const layout = read("src/app/layout.js");
    expect(layout).toContain("reportEnv");
    expect(layout).not.toMatch(/\bassertEnv\s*\(/);
  });

  it("reportEnv has no throw in its body", () => {
    const source = read("src/lib/env.js");
    const start = source.indexOf("export function reportEnv");
    const end = source.indexOf("export function assertEnv");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(source.slice(start, end)).not.toContain("throw");
  });

  it("no page, layout or route imports the throwing assertEnv", () => {
    // Scripts may use it; anything serving a request may not.
    const offenders = [];
    const walk = (dir) => {
      const fs = require("node:fs");
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(js|jsx)$/.test(entry.name) && !entry.name.includes(".test.")) {
          const src = fs.readFileSync(full, "utf8");
          if (/\bassertEnv\b/.test(src)) offenders.push(full);
        }
      }
    };
    walk(path.join(here, "..", "app"));
    expect(offenders).toEqual([]);
  });
});

describe("mongoose does not throw at import time", () => {
  it("guards the URI inside connectDB, not at module scope", () => {
    /**
     * Almost every route imports this transitively — the landing page does,
     * via `auth`. A module-scope throw therefore took the whole site down
     * rather than just the routes that need a database.
     */
    const source = read("src/lib/mongoose.js");
    const beforeExport = source.slice(0, source.indexOf("export default"));
    expect(beforeExport).not.toContain("throw new Error");

    // And the check still exists, just moved inside the function.
    expect(source.slice(source.indexOf("export default"))).toContain(
      "MONGODB_URI is not set"
    );
  });

  it("optional-chains the URI it reads at module scope", () => {
    // `undefined.startsWith` would recreate the same import-time crash.
    const source = read("src/lib/mongoose.js");
    expect(source).toContain('MONGODB_URI?.startsWith');
  });
});

describe("severity matches blast radius", () => {
  const ORIGINAL = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  it("treats a localhost NEXTAUTH_URL on a deployment as a warning", async () => {
    process.env.NODE_ENV = "production";
    process.env.VERCEL = "1";
    process.env.NEXTAUTH_URL = "http://localhost:3000";
    process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/test";
    process.env.AUTH_SECRET = "Zk3mQp7RvT2wYc8LdFgH1jN4bV6sX9eA0uI5oP2qW7r=";
    delete process.env.NEXT_PHASE;

    const { checkEnv } = await import("./env");
    const { errors, warnings } = checkEnv();

    // It breaks Google sign-in only. Everything else serves, so it must not
    // be fatal — that escalation is what caused the outage.
    expect(errors).toEqual([]);
    expect(warnings.join(" ")).toMatch(/NEXTAUTH_URL/);
  });

  it("still reports genuinely missing required variables as errors", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.MONGODB_URI;
    delete process.env.AUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;

    const { checkEnv } = await import("./env");
    const { errors } = checkEnv();

    expect(errors.join(" ")).toMatch(/MONGODB_URI/);
    expect(errors.join(" ")).toMatch(/AUTH_SECRET/);
  });

  it("reportEnv returns instead of throwing, whatever is missing", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.MONGODB_URI;
    delete process.env.AUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;

    const { reportEnv } = await import("./env");
    const spyError = vi.spyOn(console, "error").mockImplementation(() => {});
    const spyWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(() => reportEnv()).not.toThrow();
    // It must still say something — silence would be its own failure.
    expect(spyError).toHaveBeenCalled();

    spyError.mockRestore();
    spyWarn.mockRestore();
  });
});

describe("placeholder detection", () => {
  const ORIGINAL = { ...process.env };
  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  it("flags the actual placeholders from .env.example", async () => {
    vi.resetModules();
    process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/test";
    process.env.AUTH_SECRET = "replace-with-a-strong-random-secret";
    delete process.env.NEXTAUTH_SECRET;

    const { checkEnv } = await import("./env");
    expect(checkEnv().errors.join(" ")).toMatch(/placeholder/i);
  });

  it("does not flag a real random secret that happens to contain 'xxx'", async () => {
    // The false positive this guards: a generated base64 secret can contain
    // any substring, and a check that cries wolf stops being read.
    vi.resetModules();
    process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/test";
    process.env.AUTH_SECRET = "aBcXxxDeFgHiJkLmNoPqRsTuVwXyZ0123456789+/=";
    delete process.env.NEXTAUTH_SECRET;

    const { checkEnv } = await import("./env");
    expect(checkEnv().errors).toEqual([]);
  });
});
