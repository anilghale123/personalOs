import { describe, expect, it } from "vitest";
import {
  CHECK_IN,
  buildWeeklyDigest,
  buildWeeklyPrompt,
  classifyCheckIn,
  summariseWeek,
  weeklyPromptPayload,
} from "./weekly";
import { allowedNumbers, assertNoInventedNumbers, extractNumbers } from "./narrate";
import { buildDailySignals } from "./signals";

const WEEK_START = "2026-08-17";
const WEEK_END = "2026-08-23";

const at = (date) => new Date(`${date}T09:00:00`).toISOString();

/** An insight with a strength history, for check-in classification. */
function insight(overrides = {}) {
  return {
    id: "i1",
    statement: "A pattern.",
    status: "active",
    timesConfirmed: 3,
    firstDetectedAt: at("2026-07-06"),
    strengthHistory: [],
    ...overrides,
  };
}

describe("classifyCheckIn", () => {
  it("calls a pattern first seen this week new", () => {
    expect(
      classifyCheckIn(insight({ firstDetectedAt: at("2026-08-19") }), WEEK_START, WEEK_END)
    ).toBe(CHECK_IN.NEW);
  });

  it("calls a lapsed pattern faded", () => {
    expect(classifyCheckIn(insight({ status: "stale" }), WEEK_START, WEEK_END)).toBe(
      CHECK_IN.FADED
    );
  });

  it("calls a steady pattern held", () => {
    const row = insight({
      strengthHistory: [
        { date: at("2026-08-10"), value: 0.5 },
        { date: at("2026-08-19"), value: 0.52 },
      ],
    });
    expect(classifyCheckIn(row, WEEK_START, WEEK_END)).toBe(CHECK_IN.HELD);
  });

  it("notices a pattern getting stronger", () => {
    const row = insight({
      strengthHistory: [
        { date: at("2026-08-10"), value: 0.4 },
        { date: at("2026-08-19"), value: 0.62 },
      ],
    });
    expect(classifyCheckIn(row, WEEK_START, WEEK_END)).toBe(CHECK_IN.STRENGTHENED);
  });

  it("notices a pattern getting weaker", () => {
    const row = insight({
      strengthHistory: [
        { date: at("2026-08-10"), value: 0.7 },
        { date: at("2026-08-19"), value: 0.4 },
      ],
    });
    expect(classifyCheckIn(row, WEEK_START, WEEK_END)).toBe(CHECK_IN.WEAKENED);
  });

  it("compares magnitude, so a negative effect strengthening is not read as weakening", () => {
    const row = insight({
      strengthHistory: [
        { date: at("2026-08-10"), value: -0.4 },
        { date: at("2026-08-19"), value: -0.65 },
      ],
    });
    expect(classifyCheckIn(row, WEEK_START, WEEK_END)).toBe(CHECK_IN.STRENGTHENED);
  });

  it("says nothing about a pattern that was not checked this week", () => {
    const row = insight({
      strengthHistory: [{ date: at("2026-08-03"), value: 0.5 }],
    });
    expect(classifyCheckIn(row, WEEK_START, WEEK_END)).toBeNull();
  });

  it("calls a first-ever confirmation held rather than comparing to nothing", () => {
    const row = insight({
      strengthHistory: [{ date: at("2026-08-19"), value: 0.5 }],
    });
    expect(classifyCheckIn(row, WEEK_START, WEEK_END)).toBe(CHECK_IN.HELD);
  });
});

describe("summariseWeek", () => {
  const categories = [
    { _id: "c-need", name: "N", type: "need" },
    { _id: "c-want", name: "W", type: "want" },
  ];

  const week = buildDailySignals({
    from: WEEK_START,
    to: WEEK_END,
    categories,
    expenses: [
      { amountPaisa: 100000, categoryId: "c-need", date: "2026-08-17" },
      { amountPaisa: 50000, categoryId: "c-want", date: "2026-08-18" },
    ],
    journals: [
      { date: "2026-08-17", mood: "good", content: "one two three" },
      { date: "2026-08-18", mood: "okay", content: "" },
    ],
    notes: [{ date: "2026-08-17", type: "gratitude" }],
    habitLogs: [
      { date: new Date("2026-08-17T00:00:00.000Z"), habitName: "Run", completed: true },
      { date: new Date("2026-08-18T00:00:00.000Z"), habitName: "Run", completed: false },
    ],
  });

  it("totals the week in whole rupees, never paisa", () => {
    const summary = summariseWeek(week);
    expect(summary.spendRupees).toBe(1500);
    expect(summary.wantSpendRupees).toBe(500);
  });

  it("averages only the days that were actually recorded", () => {
    const summary = summariseWeek(week);
    expect(summary.moodDaysRecorded).toBe(2);
    // good (4) and okay (3) → 3.5, not diluted by five unrecorded days.
    expect(summary.averageMood).toBe(3.5);
    expect(summary.habitCompletionPercent).toBe(50);
    expect(summary.journalDays).toBe(1);
    expect(summary.gratitudeNotes).toBe(1);
  });

  it("reports change against the prior week", () => {
    const prior = buildDailySignals({
      from: "2026-08-10",
      to: "2026-08-16",
      categories,
      expenses: [{ amountPaisa: 100000, categoryId: "c-need", date: "2026-08-10" }],
      journals: [{ date: "2026-08-10", mood: "bad", content: "" }],
    });
    const summary = summariseWeek(week, prior);
    // 1000 → 1500 rupees
    expect(summary.spendChangePercent).toBe(50);
    // mood 2 → 3.5
    expect(summary.moodChange).toBe(1.5);
  });

  it("returns null rather than a fake zero when nothing was recorded", () => {
    const summary = summariseWeek(
      buildDailySignals({ from: WEEK_START, to: WEEK_END, categories })
    );
    expect(summary.averageMood).toBeNull();
    expect(summary.habitCompletionPercent).toBeNull();
    expect(summary.spendChangePercent).toBeNull();
    expect(summary.daysRecorded).toBe(0);
  });
});

describe("buildWeeklyDigest", () => {
  const insights = [
    insight({ id: "new-one", firstDetectedAt: at("2026-08-19"), statement: "Brand new." }),
    insight({
      id: "held-one",
      statement: "Still true.",
      strengthHistory: [
        { date: at("2026-08-10"), value: 0.5 },
        { date: at("2026-08-19"), value: 0.5 },
      ],
    }),
    insight({ id: "faded-one", status: "stale", statement: "Gone quiet." }),
    insight({
      id: "silent-one",
      statement: "Not checked.",
      strengthHistory: [{ date: at("2026-07-20"), value: 0.5 }],
    }),
  ];

  const digest = buildWeeklyDigest({
    insights,
    signals: [],
    priorSignals: [],
    weekStart: WEEK_START,
    weekEnd: WEEK_END,
    testedCount: 34,
  });

  it("separates what's new from what was re-checked", () => {
    expect(digest.newPatterns.map((p) => p.id)).toEqual(["new-one"]);
    expect(digest.checkIns.map((c) => c.id).sort()).toEqual(["faded-one", "held-one"]);
  });

  it("leaves out patterns that weren't looked at this week", () => {
    expect(digest.checkIns.find((c) => c.id === "silent-one")).toBeUndefined();
  });

  it("carries the tested count for the honest nothing-found line", () => {
    expect(digest.testedCount).toBe(34);
  });
});

describe("the weekly prompt", () => {
  const digest = buildWeeklyDigest({
    insights: [
      insight({
        id: "n",
        firstDetectedAt: at("2026-08-19"),
        statement: "You spend more on wants after a low-mood day.",
        confidence: "low",
        n: 46,
      }),
    ],
    signals: [],
    priorSignals: [],
    weekStart: WEEK_START,
    weekEnd: WEEK_END,
  });

  it("hands over statements and finished figures, never raw entries or dates", () => {
    const payload = weeklyPromptPayload(digest);
    const serialised = JSON.stringify(payload);
    expect(serialised).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(payload.newPatterns[0].statement).toContain("low-mood day");
    expect(payload.weekSummary).toBeDefined();
  });

  it("instructs the model not to recalculate or claim causation", () => {
    const prompt = buildWeeklyPrompt(digest);
    expect(prompt).toContain("do not recalculate");
    expect(prompt).toContain("use only the numbers provided");
    expect(prompt).toContain("association not causation");
  });

  it("produces a number whitelist the guardrail can hold prose to", () => {
    const allowed = allowedNumbers(weeklyPromptPayload(digest));
    expect(allowed).toContain(46);
    // A reflection quoting a figure it was never given is rejected.
    expect(assertNoInventedNumbers("Your spending rose 340% this week.", allowed).ok).toBe(
      false
    );
    expect(
      assertNoInventedNumbers("Measured across 46 days, it holds.", allowed).ok
    ).toBe(true);
  });

  it("keeps the summary numeric so the whitelist is meaningful", () => {
    const summary = summariseWeek([]);
    // Nothing recorded still yields a well-formed object rather than NaN.
    expect(extractNumbers(JSON.stringify(summary)).every(Number.isFinite)).toBe(true);
  });
});
