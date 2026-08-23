import { describe, expect, it } from "vitest";
import {
  allowedNumbers,
  assertHedged,
  assertNoCausalClaims,
  assertNoInventedNumbers,
  buildExplanationPrompt,
  buildNarrationPrompt,
  extractNumbers,
  narrationPayload,
} from "./narrate";

/** A realistic finding to narrate: money in paisa, mood in points. */
const INSIGHT = {
  id: "abc",
  statement:
    "On low-mood days you spend 62% more on wants than on high-mood days — a typical NPR 2,450 against NPR 1,512.",
  domains: ["journal", "money"],
  direction: "positive",
  n: 46,
  confidence: "moderate",
  timesConfirmed: 3,
  effect: { standardised: 0.41, unit: "paisa", value: 93800 },
  evidence: {
    kind: "two_group",
    groups: {
      a: { label: "Low-mood days", n: 21, mean: 250000, median: 245000 },
      b: { label: "High-mood days", n: 25, mean: 155000, median: 151200 },
    },
  },
};

describe("extractNumbers", () => {
  it("finds plain, comma-grouped and decimal figures", () => {
    expect(extractNumbers("46 days, NPR 2,450 and 0.41 effect")).toEqual([46, 2450, 0.41]);
  });

  it("strips percent signs and currency without losing the number", () => {
    expect(extractNumbers("62% more, NPR 1,512")).toEqual([62, 1512]);
  });

  it("finds nothing in prose with no figures", () => {
    expect(extractNumbers("Your spending tends to run higher on those days.")).toEqual([]);
    expect(extractNumbers(null)).toEqual([]);
  });
});

describe("allowedNumbers", () => {
  const allowed = allowedNumbers(narrationPayload(INSIGHT));

  it("includes the figures already in the statement", () => {
    expect(allowed).toContain(62);
    expect(allowed).toContain(2450);
    expect(allowed).toContain(1512);
  });

  it("includes the sample size and group sizes", () => {
    expect(allowed).toContain(46);
    expect(allowed).toContain(21);
    expect(allowed).toContain(25);
  });

  it("converts paisa group figures to the rupees prose speaks in", () => {
    // median 245000 paisa is NPR 2,450 — the payload carries the rupee form.
    expect(allowed).toContain(2450);
    expect(allowed).toContain(1512);
  });

  it("allows a ratio to be expressed as a percentage", () => {
    // effect 0.41 may legitimately be described as 41%.
    expect(allowed).toContain(41);
  });
});

describe("assertNoInventedNumbers", () => {
  const allowed = allowedNumbers(narrationPayload(INSIGHT));

  it("accepts narration that only reuses the given figures", () => {
    const output =
      "On days you rated your mood low, discretionary spending tends to sit around NPR 2,450, against NPR 1,512 on high-mood days. This was measured across 46 days.";
    expect(assertNoInventedNumbers(output, allowed).ok).toBe(true);
  });

  it("accepts prose with no numbers at all", () => {
    expect(
      assertNoInventedNumbers("Your discretionary spending tends to run higher.", allowed).ok
    ).toBe(true);
  });

  it("tolerates rounding, which is not invention", () => {
    // 0.41 → "41%", 1512 → "1,510"
    expect(assertNoInventedNumbers("about 41% of the time", allowed).ok).toBe(true);
    expect(assertNoInventedNumbers("roughly NPR 1,510", allowed).ok).toBe(true);
  });

  it("rejects a statistic that was never given to it", () => {
    const result = assertNoInventedNumbers(
      "You spend NPR 9,900 more, about 3 times as much, over 180 days.",
      allowed
    );
    expect(result.ok).toBe(false);
    expect(result.invented).toContain(9900);
    expect(result.invented).toContain(180);
  });

  it("rejects a plausible-looking but unsupplied percentage", () => {
    const result = assertNoInventedNumbers("spending was 78% higher", allowed);
    expect(result.ok).toBe(false);
    expect(result.invented).toContain(78);
  });

  it("rejects everything numeric when nothing is allowed", () => {
    expect(assertNoInventedNumbers("It happened 12 times.", []).ok).toBe(false);
  });
});

describe("assertNoCausalClaims", () => {
  it("accepts associative phrasing", () => {
    const outputs = [
      "On days when you spend more, your mood tends to sit lower the next morning.",
      "These two move alongside each other across the window measured.",
      "Your habit completion and your mood move together.",
    ];
    for (const output of outputs) {
      expect(assertNoCausalClaims(output).ok, output).toBe(true);
    }
  });

  it("rejects causal claims, however fluently written", () => {
    const outputs = [
      "Low mood causes you to spend more.",
      "Skipping your run leads to a worse day.",
      "Your spending is driven by how you feel.",
      "Running improves your mood.",
      "This is because of your weekend routine.",
      "That explains the pattern in your spending.",
    ];
    for (const output of outputs) {
      const result = assertNoCausalClaims(output);
      expect(result.ok, output).toBe(false);
      expect(result.terms.length).toBeGreaterThan(0);
    }
  });

  it("is case-insensitive", () => {
    expect(assertNoCausalClaims("Low mood CAUSES overspending.").ok).toBe(false);
  });
});

describe("assertHedged", () => {
  it("accepts an explanation offered as possibilities", () => {
    expect(
      assertHedged(
        "One explanation is that a hard day makes small comforts more appealing. It might also run the other way. A third factor could drive both."
      ).ok
    ).toBe(true);
  });

  it("rejects an explanation stated as fact", () => {
    expect(
      assertHedged("A hard day drives you to spend. The cause is emotional, not financial.").ok
    ).toBe(false);
  });
});

describe("narrationPayload", () => {
  const payload = narrationPayload(INSIGHT);

  it("carries the finished figures the model needs", () => {
    expect(payload.daysMeasured).toBe(46);
    expect(payload.confidence).toBe("moderate");
    expect(payload.groups.a.days).toBe(21);
    // Money is handed over in rupees, already rounded.
    expect(payload.groups.a.typical).toBe(2450);
    expect(payload.groups.b.typical).toBe(1512);
  });

  it("carries no raw journal text, expense rows, dates or evidence points", () => {
    const serialised = JSON.stringify(payload);
    expect(serialised).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(payload.points).toBeUndefined();
    expect(payload.topDays).toBeUndefined();
    expect(serialised).not.toContain("content");
  });

  it("survives a correlation finding with no groups", () => {
    const payload = narrationPayload({
      ...INSIGHT,
      evidence: { kind: "correlation", points: [] },
    });
    expect(payload.groups).toBeNull();
    expect(payload.daysMeasured).toBe(46);
  });
});

describe("prompts", () => {
  it("tells the model not to recalculate anything", () => {
    const prompt = buildNarrationPrompt(narrationPayload(INSIGHT));
    expect(prompt).toContain("do not recalculate");
    expect(prompt).toContain("ONLY numbers present in the finding");
    expect(prompt).toContain("never causation");
  });

  it("requires the explanation to include a reverse-causation candidate", () => {
    const prompt = buildExplanationPrompt(INSIGHT);
    expect(prompt).toContain("the OTHER way");
    expect(prompt).toContain("third factor");
    expect(prompt).toContain("Never assert which is correct");
  });
});
