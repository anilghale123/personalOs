import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * A render error must never reach the user as Next's own crash screen.
 *
 * With no `error.jsx` anywhere, anything thrown while rendering produced
 * "Application error: a client-side exception has occurred" — unbranded,
 * unactionable, and with no way forward but the back button. It also implies
 * the data is gone, which it never is.
 *
 * Three boundaries are needed and none of them substitutes for another:
 *
 *   - `app/app/error.jsx`  keeps the shell and its navigation alive, so a
 *     screen that fails is a screen that failed, not the app falling over.
 *   - `app/error.jsx`      covers everything outside the shell.
 *   - `app/global-error.jsx` is the only thing that can catch an error
 *     thrown by the root layout itself, which is why it renders its own
 *     `<html>` and `<body>`.
 *
 * This fails if any of them is removed, because the symptom only appears
 * when something is already going wrong — the worst moment to discover the
 * safety net was taken down.
 */

const here = path.dirname(fileURLToPath(import.meta.url));

/** Boundaries that must exist, relative to `src/app`. */
const REQUIRED = [
  { file: "global-error.jsx", covers: "an error thrown by the root layout" },
  { file: "error.jsx", covers: "the landing page, sign-in and privacy" },
  { file: "app/error.jsx", covers: "every screen inside the app shell" },
];

describe("error boundaries", () => {
  for (const { file, covers } of REQUIRED) {
    it(`src/app/${file} exists — it covers ${covers}`, () => {
      expect(fs.existsSync(path.join(here, file))).toBe(true);
    });
  }

  /**
   * Next only treats these as boundaries when they are client components,
   * and a missing directive fails silently: the file is there, the error
   * still reaches the crash screen.
   */
  it("declares every boundary a client component", () => {
    for (const { file } of REQUIRED) {
      const source = fs.readFileSync(path.join(here, file), "utf8");
      expect(source, `${file} is missing "use client"`).toMatch(
        /^["']use client["']/m
      );
    }
  });

  /** A boundary that cannot be dismissed strands whoever reaches it. */
  it("gives every boundary a way out", () => {
    for (const { file } of REQUIRED) {
      const source = fs.readFileSync(path.join(here, file), "utf8");
      expect(source, `${file} does not offer a reset`).toContain("reset");
    }
  });
});

/**
 * `useSearchParams` needs a Suspense boundary in a prerendered route.
 *
 * Without one the params can be absent on the first client render, so
 * `searchParams.get(...)` throws — the exact crash this file exists to keep
 * out. Every screen that reads them is also written to tolerate their
 * absence (`searchParams?.get`), but the boundary is what stops the whole
 * page opting out of prerendering, so both matter.
 */
describe("useSearchParams", () => {
  const SRC = path.join(here, "..");

  function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return /\.(js|jsx)$/.test(entry.name) && !entry.name.includes(".test.")
        ? [full]
        : [];
    });
  }

  it("is always read optionally, so absent params are a default not a crash", () => {
    const offenders = walk(SRC).filter((file) => {
      const source = fs.readFileSync(file, "utf8");
      if (!source.includes("useSearchParams")) return false;
      // `useSearchParams().get(` or a bare `searchParams.get(` — both blow up
      // on nothing. The safe forms are `?.get(` on either.
      return (
        /useSearchParams\(\)\.get\(/.test(source) ||
        /[^?.]\bsearchParams\.get\(/.test(source)
      );
    });

    expect(
      offenders.map((f) => path.relative(SRC, f)),
      "These read search params without optional chaining, which throws when " +
        "the params are not yet available on a prerendered route"
    ).toEqual([]);
  });
});
