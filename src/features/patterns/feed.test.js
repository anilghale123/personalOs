import { describe, expect, it } from "vitest";
import {
  confidenceDots,
  confidenceLabel,
  rankFeed,
  scoreInsight,
  splitFeed,
  weeksSince,
} from "./feed";

const NOW = new Date("2026-08-22T12:00:00.000Z");

/** A plausible feed item; override whatever the test is about. */
function insight(overrides = {}) {
  return {
    id: overrides.id ?? "i1",
    detectorId: "habit_rate_mood",
    status: "active",
    confidence: "low",
    qValue: 0.01,
    effect: { standardised: 0.5 },
    lastConfirmedAt: NOW.toISOString(),
    firstDetectedAt: NOW.toISOString(),
    readAt: null,
    feedback: null,
    unstable: false,
    ...overrides,
  };
}

describe("scoreInsight", () => {
  it("scores a stronger effect above a weaker one, all else equal", () => {
    const strong = scoreInsight(insight({ effect: { standardised: 0.8 } }), NOW);
    const weak = scoreInsight(insight({ effect: { standardised: 0.35 } }), NOW);
    expect(strong).toBeGreaterThan(weak);
  });

  it("scores a more certain finding above a borderline one", () => {
    const certain = scoreInsight(insight({ qValue: 0.001 }), NOW);
    const borderline = scoreInsight(insight({ qValue: 0.099 }), NOW);
    expect(certain).toBeGreaterThan(borderline);
  });

  it("lifts forward-looking detectors above the obvious ones", () => {
    const forward = scoreInsight(insight({ detectorId: "habit_mood_next_day" }), NOW);
    const obvious = scoreInsight(insight({ detectorId: "weekend_mood" }), NOW);
    expect(forward).toBeGreaterThan(obvious);
  });

  it("sinks a pattern the user says they already knew", () => {
    const knew = scoreInsight(insight({ feedback: { rating: "knew_it" } }), NOW);
    const fresh = scoreInsight(insight(), NOW);
    expect(knew).toBeLessThan(fresh * 0.5);
  });

  it("lifts one the user called useful", () => {
    expect(scoreInsight(insight({ feedback: { rating: "useful" } }), NOW)).toBeGreaterThan(
      scoreInsight(insight(), NOW)
    );
  });

  it("demotes an already-read insight without burying it", () => {
    const read = scoreInsight(insight({ readAt: NOW.toISOString() }), NOW);
    const unread = scoreInsight(insight(), NOW);
    expect(read).toBeLessThan(unread);
    expect(read).toBeGreaterThan(unread * 0.5);
  });

  it("demotes a sign-flipped pattern", () => {
    expect(scoreInsight(insight({ unstable: true }), NOW)).toBeLessThan(
      scoreInsight(insight(), NOW)
    );
  });

  it("keeps a stale pattern out of contention", () => {
    expect(scoreInsight(insight({ status: "stale" }), NOW)).toBeLessThan(
      scoreInsight(insight(), NOW) * 0.5
    );
  });

  it("decays with age, but only gently and never to nothing", () => {
    const old = insight({
      lastConfirmedAt: new Date(NOW.getTime() - 60 * 86_400_000).toISOString(),
    });
    const score = scoreInsight(old, NOW);
    expect(score).toBeLessThan(scoreInsight(insight(), NOW));
    expect(score).toBeGreaterThan(scoreInsight(insight(), NOW) * 0.55);
  });
});

describe("rankFeed", () => {
  it("orders best first and attaches the score", () => {
    const ranked = rankFeed(
      [
        insight({ id: "weak", effect: { standardised: 0.35 } }),
        insight({ id: "strong", effect: { standardised: 0.9 } }),
      ],
      { now: NOW }
    );
    expect(ranked.map((i) => i.id)).toEqual(["strong", "weak"]);
    expect(ranked[0].rankScore).toBeGreaterThan(0);
  });

  it("handles an empty feed", () => {
    expect(rankFeed([], { now: NOW })).toEqual([]);
    expect(rankFeed(undefined, { now: NOW })).toEqual([]);
  });
});

describe("splitFeed", () => {
  it("headlines the top-ranked unread insight", () => {
    const { headline, rest } = splitFeed(
      [
        insight({ id: "read-but-strong", effect: { standardised: 0.95 }, readAt: NOW.toISOString() }),
        insight({ id: "unread", effect: { standardised: 0.6 } }),
      ],
      { now: NOW }
    );
    expect(headline.id).toBe("unread");
    expect(rest.map((i) => i.id)).toEqual(["read-but-strong"]);
  });

  it("falls back to the strongest when everything has been read", () => {
    const { headline } = splitFeed(
      [
        insight({ id: "a", effect: { standardised: 0.4 }, readAt: NOW.toISOString() }),
        insight({ id: "b", effect: { standardised: 0.9 }, readAt: NOW.toISOString() }),
      ],
      { now: NOW }
    );
    expect(headline.id).toBe("b");
  });

  it("shows only active insights — stale and dismissed stay in the archive", () => {
    const { headline, rest } = splitFeed(
      [
        insight({ id: "stale", status: "stale" }),
        insight({ id: "dismissed", status: "dismissed" }),
        insight({ id: "live" }),
      ],
      { now: NOW }
    );
    expect(headline.id).toBe("live");
    expect(rest).toHaveLength(0);
  });

  it("caps the secondary cards so the feed does not become a spreadsheet", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      insight({ id: `i${i}`, effect: { standardised: 0.9 - i * 0.02 } })
    );
    const { rest } = splitFeed(many, { now: NOW, limit: 4 });
    expect(rest).toHaveLength(4);
  });

  it("returns an empty headline when there is nothing active", () => {
    expect(splitFeed([], { now: NOW })).toEqual({ headline: null, rest: [] });
  });
});

describe("confidence copy", () => {
  it("never mentions a p-value", () => {
    for (const confidence of ["low", "moderate", "high"]) {
      const label = confidenceLabel(insight({ confidence }), NOW);
      expect(label).not.toMatch(/p\s*[=<]/i);
      expect(label).not.toMatch(/\bq\b/i);
      expect(label.length).toBeGreaterThan(10);
    }
  });

  it("speaks moderate confidence in weeks", () => {
    const sixWeeksAgo = new Date(NOW.getTime() - 42 * 86_400_000).toISOString();
    expect(
      confidenceLabel(insight({ confidence: "moderate", firstDetectedAt: sixWeeksAgo }), NOW)
    ).toBe("Seen consistently over 6 weeks");
  });

  it("pluralises one week correctly", () => {
    const oneWeekAgo = new Date(NOW.getTime() - 8 * 86_400_000).toISOString();
    expect(
      confidenceLabel(insight({ confidence: "moderate", firstDetectedAt: oneWeekAgo }), NOW)
    ).toBe("Seen consistently over 1 week");
  });

  it("avoids claiming weeks it cannot support", () => {
    expect(
      confidenceLabel(insight({ confidence: "moderate", firstDetectedAt: NOW.toISOString() }), NOW)
    ).toBe("Seen consistently across several checks");
  });

  it("counts whole weeks only", () => {
    expect(weeksSince(new Date(NOW.getTime() - 13 * 86_400_000), NOW)).toBe(1);
    expect(weeksSince(new Date(NOW.getTime() - 14 * 86_400_000), NOW)).toBe(2);
    expect(weeksSince(null, NOW)).toBe(0);
  });

  it("maps bands to dots", () => {
    expect(confidenceDots("low")).toBe(1);
    expect(confidenceDots("moderate")).toBe(2);
    expect(confidenceDots("high")).toBe(3);
  });
});
