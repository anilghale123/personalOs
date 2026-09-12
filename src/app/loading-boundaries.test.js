import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Every dashboard section must own a loading boundary.
 *
 * Next.js resolves `loading.jsx` from the **nearest** ancestor of the segment
 * that changed. `/app/loading.jsx` therefore does not cover a change between
 * children of `/app/budget` — so navigating Expenses → Budget → Debts showed
 * no fallback at all, leaving the previous screen frozen for the duration of
 * the server render. On a serverless deploy talking to a remote database that
 * was seconds of a page that looked broken.
 *
 * This fails if a new section ships without one, because the symptom is easy
 * to miss locally (where renders take milliseconds) and obvious in production.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.join(here, "app");

/** Directories under /app that contain a page and so can be navigated to. */
function sectionsWithPages(dir, rel = "") {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    // Dynamic segments inherit their parent's boundary, which is correct:
    // a detail page is reached from the list that already has one.
    if (entry.name.startsWith("[") || entry.name.startsWith("(")) continue;

    const full = path.join(dir, entry.name);
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;
    const files = fs.readdirSync(full);

    if (files.some((f) => /^page\.(js|jsx)$/.test(f))) {
      found.push({
        route: `/app/${relPath}`,
        dir: full,
        hasLoading: files.some((f) => /^loading\.(js|jsx)$/.test(f)),
        hasLayout: files.some((f) => /^layout\.(js|jsx)$/.test(f)),
      });
    }
    found.push(...sectionsWithPages(full, relPath));
  }
  return found;
}

describe("loading boundaries", () => {
  const sections = sectionsWithPages(appDir);

  it("finds the dashboard sections", () => {
    expect(sections.length).toBeGreaterThan(4);
  });

  it("gives every section that owns a layout its own loading.jsx", () => {
    /**
     * A section with its own layout is the dangerous case: navigating between
     * its children does not re-render the layout, so an ancestor's boundary
     * never fires and the transition has no fallback whatsoever.
     */
    const offenders = sections
      .filter((s) => s.hasLayout && !s.hasLoading)
      .map((s) => s.route);

    expect(
      offenders,
      `These sections own a layout but no loading.jsx, so navigating between ` +
        `their child pages will show a frozen screen: ${offenders.join(", ")}`
    ).toEqual([]);
  });

  it("covers the top-level sections users navigate between", () => {
    // The sidebar destinations. Each is a separate section, so each needs its
    // own fallback rather than relying on /app/loading.jsx.
    const required = [
      "/app/budget",
      "/app/journal",
      "/app/planner",
      "/app/goals",
      "/app/portfolio",
      "/app/discoveries",
    ];

    const missing = required.filter((route) => {
      const section = sections.find((s) => s.route === route);
      return !section?.hasLoading;
    });

    expect(missing, `Missing loading.jsx: ${missing.join(", ")}`).toEqual([]);
  });

  it("has a root /app fallback as the backstop", () => {
    expect(
      fs.existsSync(path.join(appDir, "loading.jsx")) ||
        fs.existsSync(path.join(appDir, "loading.js"))
    ).toBe(true);
  });

  it("marks every fallback as aria-busy for assistive tech", () => {
    // A shimmer conveys "loading" visually and nothing at all otherwise.
    const loadingFiles = [
      path.join(appDir, "loading.jsx"),
      ...sections.filter((s) => s.hasLoading).map((s) => path.join(s.dir, "loading.jsx")),
    ].filter((f) => fs.existsSync(f));

    for (const file of loadingFiles) {
      const src = fs.readFileSync(file, "utf8");
      expect(src, `${path.basename(path.dirname(file))}/loading.jsx`).toMatch(
        /aria-busy/
      );
    }
  });
});

describe("the shimmer animation is actually defined", () => {
  it("declares the keyframes the Skeleton class uses", () => {
    // `before:animate-shimmer` silently does nothing if Tailwind has no such
    // animation, leaving a flat grey box that reads as broken rather than busy.
    const config = fs.readFileSync(
      path.join(here, "..", "..", "tailwind.config.js"),
      "utf8"
    );
    expect(config).toMatch(/shimmer:/);

    const skeleton = fs.readFileSync(
      path.join(here, "..", "components", "ui", "skeleton.jsx"),
      "utf8"
    );
    expect(skeleton).toContain("animate-shimmer");
    // And it must degrade for users who asked for less motion.
    expect(skeleton).toContain("motion-reduce");
  });
});
