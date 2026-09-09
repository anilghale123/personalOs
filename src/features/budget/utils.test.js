import { describe, it, expect } from "vitest";
import { budgetPeriodLabel, budgetPeriodRange, periodRange } from "./utils";

/**
 * The money screens can be read in either calendar, and the budget has to
 * agree with the expense list about where "this month" starts. When they
 * disagreed, the same person was shown NPR 26,485 spent on one screen and
 * NPR 4,003 on the next — the Gregorian slice of a Nepali month.
 */
const anchor = new Date("2026-09-09T12:00:00");

describe("periodRange month", () => {
  it("uses the Gregorian month by default", () => {
    expect(periodRange("month", anchor)).toEqual({
      start: "2026-09-01",
      end: "2026-09-30",
    });
  });

  it("uses the Bikram Sambat month when the user reads dates in Nepali", () => {
    // 9 Sep 2026 falls in Bhadra 2083, which runs 17 Aug – 16 Sep.
    expect(periodRange("month", anchor, "np")).toEqual({
      start: "2026-08-17",
      end: "2026-09-16",
    });
  });

  it("keeps weeks Gregorian and Monday-anchored in either calendar", () => {
    const en = periodRange("week", anchor, "en");
    expect(en).toEqual({ start: "2026-09-07", end: "2026-09-13" });
    expect(periodRange("week", anchor, "np")).toEqual(en);
  });

  it("falls back to the Gregorian month outside the BS table", () => {
    const beyond = new Date("2040-06-15T12:00:00");
    expect(periodRange("month", beyond, "np")).toEqual(
      periodRange("month", beyond, "en")
    );
  });
});

describe("budgetPeriodRange", () => {
  it("maps a monthly budget onto the user's calendar", () => {
    expect(budgetPeriodRange("monthly", anchor, "np")).toEqual({
      start: "2026-08-17",
      end: "2026-09-16",
    });
  });

  it("maps a weekly budget onto the Monday week", () => {
    expect(budgetPeriodRange("weekly", anchor, "np")).toEqual({
      start: "2026-09-07",
      end: "2026-09-13",
    });
  });
});

describe("budgetPeriodLabel", () => {
  it("names the AD span for a Gregorian month", () => {
    expect(budgetPeriodLabel("monthly", anchor)).toBe("Sep 1 – Sep 30");
  });

  it("names the BS month and the AD dates behind it", () => {
    expect(budgetPeriodLabel("monthly", anchor, "np")).toBe(
      "Bhadra 2083 · Aug 17 – Sep 16"
    );
  });
});
