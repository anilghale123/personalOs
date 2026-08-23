import { describe, expect, it } from "vitest";
import DailyJournal from "@/models/DailyJournal";
import { buildDailySignals, computeCoverage } from "./signals";
import { MOOD_SCORE } from "./constants";
import {
  addDays,
  dateKeyFromUtcMidnight,
  dateKeyRange,
  dayDiff,
  dowIndex,
  isWeekendKey,
  mondayOfKey,
  utcMidnightFromKey,
} from "./dates";

const CATEGORIES = [
  { _id: "c-food", name: "Food", type: "need" },
  { _id: "c-fun", name: "Entertainment", type: "want" },
  { _id: "c-save", name: "Emergency fund", type: "savings" },
];

/** buildDailySignals with sensible empty defaults for whatever is unused. */
function build(overrides) {
  return buildDailySignals({
    from: "2026-08-10",
    to: "2026-08-16",
    categories: CATEGORIES,
    ...overrides,
  });
}

/** The row for one date key. */
function day(signals, date) {
  return signals.find((s) => s.date === date);
}

describe("the test environment itself", () => {
  it("runs pinned to Kathmandu, or the date tests below prove nothing", () => {
    // UTC+05:45 — the offset that breaks a naive toISOString() date key.
    expect(new Date("2026-08-14T00:00:00.000Z").getTimezoneOffset()).toBe(-345);
  });
});

describe("date-key calendar helpers", () => {
  it("indexes Monday as 0 to match weekStartsOn: 1", () => {
    // 2026-08-10 is a Monday.
    expect(dowIndex("2026-08-10")).toBe(0);
    expect(dowIndex("2026-08-15")).toBe(5);
    expect(dowIndex("2026-08-16")).toBe(6);
    expect(isWeekendKey("2026-08-14")).toBe(false);
    expect(isWeekendKey("2026-08-15")).toBe(true);
    expect(isWeekendKey("2026-08-16")).toBe(true);
  });

  it("finds the Monday that starts a week", () => {
    expect(mondayOfKey("2026-08-16")).toBe("2026-08-10");
    expect(mondayOfKey("2026-08-10")).toBe("2026-08-10");
  });

  it("crosses month, year and leap-day boundaries", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(dayDiff("2026-01-01", "2026-12-31")).toBe(364);
  });

  it("builds an inclusive ascending range", () => {
    expect(dateKeyRange("2026-08-10", "2026-08-12")).toEqual([
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
    ]);
    expect(dateKeyRange("2026-08-12", "2026-08-10")).toEqual([]);
    expect(dateKeyRange("2026-08-10", "2026-08-10")).toHaveLength(1);
  });

  it("round-trips a HabitLog date through UTC, not local midnight", () => {
    const stored = utcMidnightFromKey("2026-08-14");
    expect(stored.toISOString()).toBe("2026-08-14T00:00:00.000Z");
    expect(dateKeyFromUtcMidnight(stored)).toBe("2026-08-14");
  });
});

describe("the date-normalisation join", () => {
  /**
   * The bug this guards against is the one that would silently poison
   * every habit pattern in the product: `HabitLog.date` is a UTC-midnight
   * Date, and applying the *local* toDateKey() to it in Nepal yields the
   * previous day. Habits would then be correlated against the wrong day's
   * expenses and mood, and nothing would look obviously broken.
   */
  it("lands a UTC-midnight habit log and a string-dated expense on the same day", () => {
    const signals = build({
      expenses: [{ amountPaisa: 50000, categoryId: "c-food", date: "2026-08-14" }],
      habitLogs: [
        {
          date: new Date("2026-08-14T00:00:00.000Z"),
          habitName: "Morning Run",
          completed: true,
        },
      ],
      journals: [{ date: "2026-08-14", mood: "good", content: "a b c" }],
    });

    const joined = day(signals, "2026-08-14");
    expect(joined.spendTotalPaisa).toBe(50000);
    expect(joined.habitByName["Morning Run"]).toBe(true);
    expect(joined.moodScore).toBe(4);

    // And nothing leaked onto the neighbouring days.
    expect(day(signals, "2026-08-13").habitsTracked).toBe(0);
    expect(day(signals, "2026-08-15").habitsTracked).toBe(0);
  });

  it("would have caught a local-midnight habit log too", () => {
    // Belt and braces: even if a log were written at local midnight in
    // Nepal (18:15 UTC the previous day), reading it must not silently
    // succeed on the wrong day — it lands on 2026-08-13, as toISOString
    // says, and the assertion documents that.
    const localMidnight = new Date("2026-08-13T18:15:00.000Z");
    expect(dateKeyFromUtcMidnight(localMidnight)).toBe("2026-08-13");
  });
});

describe("buildDailySignals", () => {
  it("returns one gap-explicit row per day, ascending", () => {
    const signals = build({});
    expect(signals).toHaveLength(7);
    expect(signals.map((s) => s.date)).toEqual([
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
      "2026-08-14",
      "2026-08-15",
      "2026-08-16",
    ]);
  });

  it("marks missing values null and never imputes them as zero", () => {
    const quiet = day(build({}), "2026-08-12");
    expect(quiet.moodScore).toBeNull();
    expect(quiet.mood).toBeNull();
    expect(quiet.habitRate).toBeNull();
    // Zero spend is a real recorded value, so it stays 0 — but the flag
    // is what tells a detector whether anything was logged at all.
    expect(quiet.spendTotalPaisa).toBe(0);
    expect(quiet.hasMoneyData).toBe(false);
    expect(quiet.hasMood).toBe(false);
    expect(quiet.hasJournal).toBe(false);
  });

  it("splits spending by category type and tracks the largest expense", () => {
    const signals = build({
      expenses: [
        { amountPaisa: 180000, categoryId: "c-food", date: "2026-08-14" },
        { amountPaisa: 65000, categoryId: "c-fun", date: "2026-08-14" },
        { amountPaisa: 20000, categoryId: "c-save", date: "2026-08-14" },
      ],
    });

    const d = day(signals, "2026-08-14");
    expect(d.spendTotalPaisa).toBe(265000);
    expect(d.spendNeedPaisa).toBe(180000);
    expect(d.spendWantPaisa).toBe(65000);
    expect(d.spendSavingsPaisa).toBe(20000);
    expect(d.expenseCount).toBe(3);
    expect(d.largestExpensePaisa).toBe(180000);
    expect(d.spendByCategoryId["c-fun"]).toBe(65000);
    expect(d.hasMoneyData).toBe(true);
  });

  it("counts an expense with a missing category in the total but in no bucket", () => {
    const d = day(
      build({
        expenses: [{ amountPaisa: 9000, categoryId: "c-deleted", date: "2026-08-14" }],
      }),
      "2026-08-14"
    );
    expect(d.spendTotalPaisa).toBe(9000);
    expect(d.spendNeedPaisa + d.spendWantPaisa + d.spendSavingsPaisa).toBe(0);
  });

  it("separates recurring spend so rhythm detectors can exclude it", () => {
    const d = day(
      build({
        expenses: [
          {
            amountPaisa: 2000000,
            categoryId: "c-food",
            date: "2026-08-14",
            isRecurring: true,
          },
          { amountPaisa: 30000, categoryId: "c-fun", date: "2026-08-14" },
          {
            amountPaisa: 500000,
            categoryId: "c-food",
            date: "2026-08-14",
            autoGenerated: true,
          },
        ],
      }),
      "2026-08-14"
    );
    expect(d.spendTotalPaisa).toBe(2530000);
    expect(d.spendRecurringPaisa).toBe(2500000);
    expect(d.largestExpensePaisa).toBe(2000000);
    // The rent must not be mistaken for an unusually large purchase.
    expect(d.largestManualExpensePaisa).toBe(30000);
  });

  it("excludes soft-deleted expenses and notes", () => {
    const d = day(
      build({
        expenses: [
          { amountPaisa: 5000, categoryId: "c-food", date: "2026-08-14" },
          {
            amountPaisa: 999000,
            categoryId: "c-food",
            date: "2026-08-14",
            deletedAt: new Date(),
          },
        ],
        notes: [
          { date: "2026-08-14", type: "gratitude" },
          { date: "2026-08-14", type: "note", deletedAt: new Date() },
        ],
      }),
      "2026-08-14"
    );
    expect(d.spendTotalPaisa).toBe(5000);
    expect(d.expenseCount).toBe(1);
    expect(d.noteCount).toBe(1);
    expect(d.noteCountByType.gratitude).toBe(1);
    expect(d.noteCountByType.note).toBe(0);
  });

  it("scores mood on the same 1-5 scale the journal stores", () => {
    const signals = build({
      journals: [
        { date: "2026-08-10", mood: "awful", content: "" },
        { date: "2026-08-11", mood: "amazing", content: "" },
        { date: "2026-08-12", mood: null, content: "wrote a lot today" },
      ],
    });
    expect(day(signals, "2026-08-10").moodScore).toBe(1);
    expect(day(signals, "2026-08-11").moodScore).toBe(5);
    // A journal with words but no mood is a journal day, not a mood day.
    expect(day(signals, "2026-08-12").moodScore).toBeNull();
    expect(day(signals, "2026-08-12").hasJournal).toBe(true);
  });

  it("counts journal words and treats whitespace-only content as no entry", () => {
    const signals = build({
      journals: [
        { date: "2026-08-10", content: "  one   two \n three  " },
        { date: "2026-08-11", mood: "okay", content: "   " },
      ],
    });
    expect(day(signals, "2026-08-10").journalWords).toBe(3);
    expect(day(signals, "2026-08-11").journalWords).toBe(0);
    expect(day(signals, "2026-08-11").hasJournal).toBe(false);
    expect(day(signals, "2026-08-11").hasMood).toBe(true);
  });

  it("computes a habit rate only from habits actually tracked that day", () => {
    const signals = build({
      habitLogs: [
        { date: utcMidnightFromKey("2026-08-14"), habitName: "Run", completed: true },
        { date: utcMidnightFromKey("2026-08-14"), habitName: "Read", completed: false },
        { date: utcMidnightFromKey("2026-08-14"), habitName: "Meditate", completed: true },
      ],
    });
    const d = day(signals, "2026-08-14");
    expect(d.habitsTracked).toBe(3);
    expect(d.habitsDone).toBe(2);
    expect(d.habitRate).toBeCloseTo(2 / 3, 12);
    expect(d.habitByName).toEqual({ Run: true, Read: false, Meditate: true });
    // An untracked day is not a zero-completion day.
    expect(day(signals, "2026-08-13").habitRate).toBeNull();
  });

  it("expands a planner week onto its individual days", () => {
    const signals = build({
      plannerGoals: [
        {
          weekStart: "2026-08-10",
          days: {
            Mon: "done",
            Tue: "missed",
            Wed: "pending",
            Thu: "done",
            Fri: "pending",
            Sat: "pending",
            Sun: "pending",
          },
        },
      ],
    });
    expect(day(signals, "2026-08-10").plannerDone).toBe(1);
    expect(day(signals, "2026-08-11").plannerMissed).toBe(1);
    expect(day(signals, "2026-08-12").plannerPending).toBe(1);
    expect(day(signals, "2026-08-13").plannerDone).toBe(1);
  });

  it("ignores documents that fall outside the window", () => {
    const signals = build({
      expenses: [{ amountPaisa: 5000, categoryId: "c-food", date: "2026-09-01" }],
      habitLogs: [
        { date: utcMidnightFromKey("2026-07-01"), habitName: "Run", completed: true },
      ],
    });
    expect(signals.every((s) => s.spendTotalPaisa === 0)).toBe(true);
    expect(signals.every((s) => s.habitsTracked === 0)).toBe(true);
  });
});

describe("computeCoverage", () => {
  it("counts days per domain, not documents", () => {
    const signals = build({
      expenses: [
        { amountPaisa: 100, categoryId: "c-food", date: "2026-08-10" },
        { amountPaisa: 200, categoryId: "c-food", date: "2026-08-10" },
        { amountPaisa: 300, categoryId: "c-food", date: "2026-08-11" },
      ],
      journals: [
        { date: "2026-08-10", mood: "good", content: "words here" },
        { date: "2026-08-12", mood: "bad", content: "" },
      ],
    });

    const coverage = computeCoverage(signals);
    expect(coverage.totalDays).toBe(7);
    expect(coverage.money).toBe(2);
    expect(coverage.mood).toBe(2);
    expect(coverage.journal).toBe(1);
    expect(coverage.activeDays).toBe(3);
    expect(coverage.from).toBe("2026-08-10");
    expect(coverage.to).toBe("2026-08-16");
  });

  it("reports zero across the board for an untouched window", () => {
    expect(computeCoverage(build({})).activeDays).toBe(0);
    expect(computeCoverage([]).totalDays).toBe(0);
  });
});

describe("MOOD_SCORE", () => {
  it("covers exactly the mood values DailyJournal can store", () => {
    // The picker is a "use client" module, so the schema enum — which is
    // what actually constrains the stored data — is the source of truth.
    const enumValues = DailyJournal.schema.path("mood").enumValues.filter(Boolean);
    expect(Object.keys(MOOD_SCORE).sort()).toEqual([...enumValues].sort());
  });

  it("is ordinal and ascending from awful to amazing", () => {
    expect(Object.values(MOOD_SCORE)).toEqual([1, 2, 3, 4, 5]);
  });
});
