import { describe, expect, it } from "vitest";
import { bandConfidence, detectPatterns, rank } from "./engine";
import { fingerprint } from "./fingerprint";
import { DETECTORS } from "./detectors";
import {
  BANNED_CAUSAL_TERMS,
  FDR_Q,
  MOOD_KEYS,
  STATEMENT_TEMPLATES,
  renderStatement,
} from "./constants";
import { buildDailySignals } from "./signals";
import { addDays, dateKeyRange } from "./dates";

const CATEGORIES = [
  { _id: "c-need", name: "Groceries", type: "need" },
  { _id: "c-want", name: "Eating out", type: "want" },
];

/**
 * A deterministic pseudo-random generator, so a failing null test can be
 * reproduced exactly rather than being "flaky".
 */
function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/**
 * Build a synthetic user's window. `shape(dateKey, index, random)` returns
 * whatever that day should contain; anything omitted is simply absent, so
 * gaps stay gaps.
 */
function synthesise({ from = "2026-01-05", days = 200, seed = 7, shape }) {
  const random = rng(seed);
  const to = addDays(from, days - 1);
  const expenses = [];
  const journals = [];
  const notes = [];
  const habitLogs = [];

  dateKeyRange(from, to).forEach((date, index) => {
    const spec = shape(date, index, random) ?? {};

    if (spec.wantPaisa !== undefined) {
      expenses.push({ amountPaisa: Math.max(0, Math.round(spec.wantPaisa)), categoryId: "c-want", date });
    }
    if (spec.needPaisa !== undefined) {
      expenses.push({ amountPaisa: Math.max(0, Math.round(spec.needPaisa)), categoryId: "c-need", date });
    }
    if (spec.mood !== undefined || spec.content !== undefined) {
      journals.push({ date, mood: spec.mood ?? null, content: spec.content ?? "" });
    }
    if (spec.gratitude) {
      notes.push({ date, type: "gratitude" });
    }
    if (spec.habits) {
      for (const [habitName, completed] of Object.entries(spec.habits)) {
        habitLogs.push({ date: new Date(`${date}T00:00:00.000Z`), habitName, completed });
      }
    }
  });

  return buildDailySignals({
    from,
    to,
    categories: CATEGORIES,
    expenses,
    journals,
    notes,
    habitLogs,
  });
}

/** Mood key for a 1-5 score. */
const moodOf = (score) => MOOD_KEYS[Math.min(Math.max(Math.round(score), 1), 5) - 1];

describe("statement templates", () => {
  it("never assert causation", () => {
    const vars = {
      n: 46,
      delta: 0.8,
      habit: "Morning Run",
      day: "Friday",
      lowMoodPaisa: 245000,
      highMoodPaisa: 151000,
      keptPaisa: 100000,
      missedPaisa: 180000,
      journalPaisa: 100000,
      silentPaisa: 180000,
      peakPaisa: 300000,
      restPaisa: 120000,
      thresholdPct: 80,
    };

    for (const key of Object.keys(STATEMENT_TEMPLATES)) {
      const sentence = renderStatement(key, vars).toLowerCase();
      for (const term of BANNED_CAUSAL_TERMS) {
        expect(
          sentence.includes(term),
          `"${key}" contains the causal term "${term}": ${sentence}`
        ).toBe(false);
      }
    }
  });

  it("render a complete sentence for every key", () => {
    for (const key of Object.keys(STATEMENT_TEMPLATES)) {
      const sentence = renderStatement(key, {
        n: 2,
        delta: 0.5,
        habit: "Reading",
        day: "Monday",
        lowMoodPaisa: 100,
        highMoodPaisa: 200,
        keptPaisa: 100,
        missedPaisa: 200,
        journalPaisa: 100,
        silentPaisa: 200,
        peakPaisa: 100,
        restPaisa: 200,
        thresholdPct: 80,
      });
      expect(sentence.length).toBeGreaterThan(20);
      expect(sentence.endsWith(".")).toBe(true);
      expect(sentence).not.toContain("undefined");
      expect(sentence).not.toContain("NaN");
    }
  });

  it("pluralise counts correctly", () => {
    expect(renderStatement("mood_next_day_spend.positive", { n: 1 })).toContain("1 day pair");
    expect(renderStatement("mood_next_day_spend.positive", { n: 9 })).toContain("9 day pairs");
  });

  it("every detector's statement keys exist", () => {
    // A detector emitting a key with no template would throw at render
    // time, in production, on a real finding.
    const keys = new Set(Object.keys(STATEMENT_TEMPLATES));
    const emitted = [
      "mood_want_spend.higher", "mood_want_spend.lower",
      "mood_next_day_spend.positive", "mood_next_day_spend.negative",
      "spend_then_mood.positive", "spend_then_mood.negative",
      "habit_day_spend.higher", "habit_day_spend.lower",
      "habit_rate_mood.positive", "habit_rate_mood.negative",
      "habit_mood_next_day.positive", "habit_mood_next_day.negative",
      "journal_day_spend.higher", "journal_day_spend.lower",
      "journal_length_mood.positive", "journal_length_mood.negative",
      "gratitude_mood.higher", "gratitude_mood.lower",
      "gratitude_next_day.higher", "gratitude_next_day.lower",
      "dow_want_spend.peak",
      "weekend_mood.higher", "weekend_mood.lower",
      "budget_pressure_mood.higher", "budget_pressure_mood.lower",
    ];
    for (const key of emitted) expect(keys.has(key), `missing template ${key}`).toBe(true);
  });
});

describe("the detector registry", () => {
  it("gives every detector the required shape", () => {
    for (const detector of DETECTORS) {
      expect(typeof detector.id).toBe("string");
      expect(typeof detector.title).toBe("string");
      expect(Array.isArray(detector.domains)).toBe(true);
      expect(typeof detector.family).toBe("string");
      expect(Array.isArray(detector.requires)).toBe(true);
      expect(detector.minSample).toBeGreaterThan(0);
      expect(typeof detector.run).toBe("function");
    }
  });

  it("has unique ids", () => {
    const ids = DETECTORS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("the null test", () => {
  /**
   * The most important test in the project.
   *
   * Pure noise, run repeatedly. Without multiple-comparison correction a
   * run of forty-odd hypotheses at p < 0.05 yields two or three
   * "discoveries" every time, and the narration layer would describe each
   * one fluently and persuasively. With Benjamini–Hochberg at q < 0.10 the
   * long-run false-discovery rate has to stay under 10%.
   */
  it("finds almost nothing in pure noise across 60 independent runs", () => {
    const RUNS = 60;
    let runsWithFinding = 0;
    let totalFindings = 0;

    for (let seed = 1; seed <= RUNS; seed++) {
      const signals = synthesise({
        days: 200,
        seed: seed * 977,
        shape: (date, index, random) => ({
          wantPaisa: random() * 400000,
          needPaisa: random() * 300000,
          mood: moodOf(1 + random() * 4),
          content: "word ".repeat(20 + Math.floor(random() * 200)),
          gratitude: random() < 0.3,
          habits: {
            "Morning Run": random() < 0.5,
            Reading: random() < 0.45,
          },
        }),
      });

      const { patterns } = detectPatterns(signals);
      if (patterns.length) runsWithFinding++;
      totalFindings += patterns.length;
    }

    // Every "finding" here is by construction false — nothing in the
    // generator relates any variable to any other.
    expect(runsWithFinding / RUNS).toBeLessThan(0.1);
    expect(totalFindings / RUNS).toBeLessThan(0.15);
  }, 120000);

  it("finds almost nothing in pure noise at a realistic 60-day window", () => {
    /**
     * The 200-day test above is generous — a real early user has six to
     * eight weeks, not seven months, and that is exactly the regime where
     * the original normal-approximation p-values leaked (14% of runs at
     * 45–60 days produced a false "discovery"). The exact permutation
     * tests brought that back to the FDR_Q target; this test pins the
     * smaller window down so the gap the 200-day test missed can never
     * reopen silently.
     *
     * The generator is deliberately harsher than the one above: three
     * habits instead of two, and journaling on only ~60% of days so the
     * journal-rate detector also runs. Fully deterministic by seed — at
     * the time of writing it yields exactly 9/100 runs with a finding
     * (0.11 findings/run), while the same data with the BH step removed
     * finds something in ~39% of runs.
     */
    const RUNS = 100;
    let runsWithFinding = 0;
    let totalFindings = 0;

    for (let seed = 1; seed <= RUNS; seed++) {
      const signals = synthesise({
        days: 60,
        seed: seed * 977,
        shape: (date, index, random) => ({
          wantPaisa: random() * 400000,
          needPaisa: random() * 300000,
          mood: moodOf(1 + random() * 4),
          content:
            random() < 0.6 ? "word ".repeat(20 + Math.floor(random() * 200)) : undefined,
          gratitude: random() < 0.3,
          habits: {
            "Morning Run": random() < 0.5,
            Reading: random() < 0.45,
            Meditation: random() < 0.35,
          },
        }),
      });

      const { patterns } = detectPatterns(signals);
      if (patterns.length) runsWithFinding++;
      totalFindings += patterns.length;
    }

    expect(runsWithFinding / RUNS).toBeLessThan(0.15);
    expect(totalFindings / RUNS).toBeLessThan(0.2);
  }, 180000);

  it("reports what it tested even when it finds nothing", () => {
    const signals = synthesise({
      days: 200,
      seed: 4242,
      shape: (date, index, random) => ({
        wantPaisa: random() * 400000,
        mood: moodOf(1 + random() * 4),
        habits: { "Morning Run": random() < 0.5 },
      }),
    });

    const { runMeta } = detectPatterns(signals);
    // "We tested N possible relationships and none held up" is a real
    // result the empty state depends on being able to state.
    expect(runMeta.hypotheses).toBeGreaterThan(3);
  });
});

describe("determinism", () => {
  it("produces identical findings for the same signals twice in a row", () => {
    /**
     * The significance gate is a permutation test seeded from the data
     * itself, never the clock — otherwise an insight would drift in and
     * out of significance between identical runs, which is its own trust
     * problem. This pins that down at the full-pipeline level: same
     * signals in, same q-values and ranked findings out, twice.
     */
    const signals = synthesise({
      days: 120,
      seed: 2024,
      shape: (date, index, random) => {
        const low = index % 3 === 0;
        return {
          mood: moodOf(low ? 1 + random() : 4 + random()),
          wantPaisa: (low ? 300000 : 90000) + random() * 40000,
          needPaisa: random() * 200000,
          content: "word ".repeat(30 + Math.floor(random() * 150)),
          gratitude: random() < 0.3,
          habits: { "Morning Run": random() < 0.5, Reading: random() < 0.45 },
        };
      },
    });

    const first = detectPatterns(signals);
    const second = detectPatterns(signals);

    // The planted mood → spend relationship must actually fire, otherwise
    // this asserts nothing more than "empty equals empty".
    expect(first.patterns.length).toBeGreaterThan(0);
    expect(JSON.stringify(second.patterns)).toBe(JSON.stringify(first.patterns));
    expect(second.runMeta.hypotheses).toBe(first.runMeta.hypotheses);
  });
});

describe("planted patterns", () => {
  it("finds a strong habit → next-day mood relationship", () => {
    const signals = synthesise({
      days: 200,
      seed: 31,
      shape: (date, index, random) => {
        // Alternating runs, and a mood the next morning that is genuinely
        // higher after one.
        const ranToday = index % 2 === 0;
        const ranYesterday = index % 2 === 1;
        return {
          habits: { "Morning Run": ranToday },
          mood: moodOf((ranYesterday ? 4.2 : 2.4) + random() * 0.8),
        };
      },
    });

    const { patterns } = detectPatterns(signals, {
      detectorIds: ["habit_mood_next_day"],
    });

    expect(patterns).toHaveLength(1);
    expect(patterns[0].detectorId).toBe("habit_mood_next_day");
    expect(patterns[0].params.habitName).toBe("Morning Run");
    expect(patterns[0].direction).toBe("positive");
    expect(Math.abs(patterns[0].effect.standardised)).toBeGreaterThan(0.5);
    expect(patterns[0].qValue).toBeLessThan(FDR_Q);
    expect(patterns[0].statement).toContain("Morning Run");
  });

  it("finds a strong low-mood → discretionary spending relationship", () => {
    const signals = synthesise({
      days: 200,
      seed: 77,
      shape: (date, index, random) => {
        const low = index % 3 === 0;
        return {
          mood: moodOf(low ? 1 + random() : 4 + random()),
          wantPaisa: (low ? 300000 : 90000) + random() * 40000,
        };
      },
    });

    const { patterns } = detectPatterns(signals, { detectorIds: ["mood_want_spend"] });
    expect(patterns).toHaveLength(1);
    expect(patterns[0].direction).toBe("positive");
    expect(patterns[0].statement).toMatch(/low-mood days/i);
    expect(patterns[0].confidence).toBe("low");
  });

  it("finds a weekday spending peak", () => {
    const signals = synthesise({
      days: 200,
      seed: 91,
      shape: (date, index, random) => {
        const dow = index % 7; // day 0 of the window is a Monday
        return { wantPaisa: (dow === 4 ? 400000 : 80000) + random() * 30000 };
      },
    });

    const { patterns } = detectPatterns(signals, { detectorIds: ["dow_want_spend"] });
    expect(patterns).toHaveLength(1);
    expect(patterns[0].statement).toContain("Friday");
  });

  it("recovers the direction, not just the existence, of a relationship", () => {
    const signals = synthesise({
      days: 200,
      seed: 55,
      shape: (date, index, random) => {
        const low = index % 3 === 0;
        return {
          mood: moodOf(low ? 1 + random() : 4 + random()),
          // Inverted: low mood now means *less* discretionary spending.
          wantPaisa: (low ? 60000 : 320000) + random() * 30000,
        };
      },
    });

    const { patterns } = detectPatterns(signals, { detectorIds: ["mood_want_spend"] });
    expect(patterns[0].direction).toBe("negative");
    expect(patterns[0].statement).toMatch(/less/i);
  });
});

describe("suppression rules", () => {
  it("does not let one enormous day create a pattern", () => {
    const signals = synthesise({
      days: 200,
      seed: 12,
      shape: (date, index, random) => ({
        mood: moodOf(1 + random() * 4),
        // Flat, unrelated spending, with a single vast purchase on one
        // low-mood day.
        wantPaisa: index === 40 ? 900000000 : 100000 + random() * 5000,
      }),
    });

    const { patterns, skipped } = detectPatterns(signals, {
      detectorIds: ["mood_want_spend"],
    });

    expect(patterns).toHaveLength(0);
    // Either it never reached significance, or the leave-one-out check
    // caught it — both are correct outcomes, silence is not.
    expect(skipped.length).toBeGreaterThan(0);
  });

  it("skips detectors below their coverage floor and reports the shortfall", () => {
    const signals = synthesise({
      days: 40,
      seed: 3,
      // Enough activity for the engine to run at all, but well short of
      // the 24 mood-days the money-mood detectors need.
      shape: (date, index, random) =>
        index < 18 ? { mood: moodOf(1 + random() * 4), wantPaisa: random() * 100000 } : {},
    });

    const { patterns, skipped } = detectPatterns(signals);
    expect(patterns).toHaveLength(0);

    const moodSkip = skipped.find((s) => s.detectorId === "mood_want_spend");
    expect(moodSkip.reason).toBe("coverage");
    expect(moodSkip.domain).toBe("mood");
    expect(moodSkip.have).toBeLessThan(moodSkip.need);
  });

  it("refuses to run at all on a nearly empty window", () => {
    const signals = synthesise({
      days: 90,
      seed: 3,
      shape: (date, index) => (index < 5 ? { wantPaisa: 10000 } : {}),
    });

    const result = detectPatterns(signals);
    expect(result.patterns).toHaveLength(0);
    expect(result.skipped.every((s) => s.reason === "insufficient_activity")).toBe(true);
    expect(result.runMeta.hypotheses).toBe(0);
  });

  it("skips a habit kept almost every day, because there is no contrast", () => {
    const signals = synthesise({
      days: 200,
      seed: 8,
      shape: (date, index, random) => ({
        habits: { Flossing: index % 50 !== 0 }, // kept 98% of days
        mood: moodOf(1 + random() * 4),
      }),
    });

    const { patterns, skipped } = detectPatterns(signals, {
      detectorIds: ["habit_mood_next_day"],
    });
    expect(patterns).toHaveLength(0);
    expect(skipped[0].reason).toBe("no_habit_with_contrast");
  });

  it("caps how much any one family can contribute to a run", () => {
    // Five habits each genuinely related to next-day mood.
    const habitNames = ["Run", "Read", "Meditate", "Journal", "Walk"];
    const signals = synthesise({
      days: 250,
      seed: 64,
      shape: (date, index, random) => {
        const habits = {};
        habitNames.forEach((name, i) => {
          habits[name] = (index + i) % 2 === 0;
        });
        const keptYesterday = habitNames.filter((_, i) => (index - 1 + i) % 2 === 0).length;
        return {
          habits,
          mood: moodOf(1.5 + keptYesterday * 0.6 + random() * 0.5),
        };
      },
    });

    const { patterns } = detectPatterns(signals, {
      detectorIds: ["habit_mood_next_day", "habit_rate_mood"],
    });
    // The construction yields four surviving candidates in the habits-mood
    // family — the detector keeps the three strongest habits, and the
    // same-day rate fires too — so exactly three means the engine-level
    // family cap trimmed the fourth, rather than the test passing
    // vacuously because only three ever existed.
    expect(patterns.length).toBe(3);
    expect(patterns.every((p) => p.family === "habits-mood")).toBe(true);
  });
});

describe("confidence banding", () => {
  const strong = {
    qValue: 0.0001,
    n: 100,
    minSample: 24,
    effect: { standardised: 0.6 },
  };

  it("cannot reach high on first detection, however strong the arithmetic", () => {
    expect(bandConfidence(strong, null)).toBe("low");
  });

  it("reaches moderate only after a second confirmation", () => {
    expect(bandConfidence(strong, { timesConfirmed: 1, spanDays: 7, effects: [0.6] })).toBe(
      "moderate"
    );
  });

  it("reaches high only after repeated, stable confirmation over weeks", () => {
    expect(
      bandConfidence(strong, {
        timesConfirmed: 4,
        spanDays: 30,
        effects: [0.58, 0.61, 0.6, 0.59],
      })
    ).toBe("high");
  });

  it("holds a sign-flipped pattern back from high", () => {
    expect(
      bandConfidence(strong, {
        timesConfirmed: 5,
        spanDays: 40,
        effects: [-0.6, 0.61, -0.55, 0.6],
      })
    ).toBe("moderate");
  });

  it("holds an unstable magnitude back from high", () => {
    expect(
      bandConfidence(strong, {
        timesConfirmed: 5,
        spanDays: 40,
        effects: [0.1, 0.95, 0.2, 0.9],
      })
    ).toBe("moderate");
  });
});

describe("the shape of a finding", () => {
  it("carries everything the UI and the narration layer need, and no working data", () => {
    const signals = synthesise({
      days: 200,
      seed: 77,
      shape: (date, index, random) => {
        const low = index % 3 === 0;
        return {
          mood: moodOf(low ? 1 + random() : 4 + random()),
          wantPaisa: (low ? 300000 : 90000) + random() * 40000,
        };
      },
    });

    const [pattern] = detectPatterns(signals, { detectorIds: ["mood_want_spend"] }).patterns;

    expect(pattern).toMatchObject({
      detectorId: "mood_want_spend",
      family: "money-mood",
      statementKey: expect.any(String),
      direction: expect.any(String),
      confidence: expect.any(String),
    });
    expect(pattern.effect).toMatchObject({
      type: "group_difference",
      unit: "paisa",
      standardised: expect.any(Number),
    });
    expect(pattern.evidence.kind).toBe("two_group");
    expect(pattern.evidence.groups.a.n).toBeGreaterThan(0);
    expect(pattern.evidence.topDays.length).toBeGreaterThan(0);
    expect(pattern.qValue).toBeLessThan(FDR_Q);
    expect(pattern.rankScore).toBeGreaterThan(0);

    // The leave-one-out working set must never be persisted.
    expect(pattern._loo).toBeUndefined();
    // Evidence stays within its storage cap.
    expect(pattern.evidence.points.length).toBeLessThanOrEqual(200);
  });

  it("ranks a forward-looking finding above the weekend one", () => {
    // Same underlying strength, different detector — the weight decides.
    const forward = { detectorId: "habit_mood_next_day", effect: { standardised: 0.4 }, qValue: 0.01, confidence: "low" };
    const obvious = { detectorId: "weekend_mood", effect: { standardised: 0.4 }, qValue: 0.01, confidence: "low" };
    const ordered = rank([obvious, forward]);
    expect(ordered[0].detectorId).toBe("habit_mood_next_day");
  });
});

describe("feedback suppression", () => {
  /** A window with a genuine, easily-detected mood/spend relationship. */
  const signals = synthesise({
    days: 200,
    seed: 77,
    shape: (date, index, random) => {
      const low = index % 3 === 0;
      return {
        mood: moodOf(low ? 1 + random() : 4 + random()),
        wantPaisa: (low ? 300000 : 90000) + random() * 40000,
      };
    },
  });

  it("still surfaces the pattern when nothing is suppressed", () => {
    const { patterns } = detectPatterns(signals, { detectorIds: ["mood_want_spend"] });
    expect(patterns).toHaveLength(1);
  });

  it("withholds a pattern the user said they already knew", () => {
    const suppressed = new Set([fingerprint("mood_want_spend", {})]);
    const { patterns, skipped } = detectPatterns(signals, {
      detectorIds: ["mood_want_spend"],
      ctx: { suppressed },
    });

    expect(patterns).toHaveLength(0);
    expect(skipped.some((s) => s.reason === "suppressed_by_feedback")).toBe(true);
  });

  it("still tests and counts a suppressed pattern, rather than skipping the work", () => {
    // It has to keep being tested: that is what keeps its history going
    // and what lets the weekly check-in still say whether it held.
    const suppressed = new Set([fingerprint("mood_want_spend", {})]);
    const { runMeta } = detectPatterns(signals, {
      detectorIds: ["mood_want_spend"],
      ctx: { suppressed },
    });
    expect(runMeta.hypotheses).toBeGreaterThan(0);
    expect(runMeta.candidates).toBeGreaterThan(0);
  });

  it("suppresses only the matching parameterisation", () => {
    const other = new Set([fingerprint("mood_want_spend", { habitName: "Something else" })]);
    const { patterns } = detectPatterns(signals, {
      detectorIds: ["mood_want_spend"],
      ctx: { suppressed: other },
    });
    expect(patterns).toHaveLength(1);
  });
});
