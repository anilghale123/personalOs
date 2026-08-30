import { describe, it, expect } from "vitest";
import {
  adToBs,
  bsToAd,
  bsMonthAdRange,
  bsMonthDays,
  bsMonthOf,
  formatBsDate,
  shiftBsMonth,
  yearDays,
  BS_MIN_YEAR,
  BS_MAX_YEAR,
} from "./nepali-date";

describe("adToBs / bsToAd anchors", () => {
  it("maps the epoch both ways", () => {
    expect(adToBs("1943-04-14")).toEqual({ year: 2000, month: 0, day: 1 });
    expect(bsToAd(2000, 0, 1)).toBe("1943-04-14");
  });

  it("maps known Nepali new years", () => {
    expect(bsToAd(2081, 0, 1)).toBe("2024-04-13");
    expect(adToBs("2024-04-13")).toEqual({ year: 2081, month: 0, day: 1 });
    expect(bsToAd(2082, 0, 1)).toBe("2025-04-14");
    expect(bsToAd(2083, 0, 1)).toBe("2026-04-14");
  });

  it("round-trips every day across several years", () => {
    // 2080–2083 cover leap and common years alike.
    for (let year = 2080; year <= 2083; year++) {
      for (let month = 0; month < 12; month++) {
        for (let day = 1; day <= bsMonthDays(year, month); day++) {
          const ad = bsToAd(year, month, day);
          expect(adToBs(ad)).toEqual({ year, month, day });
        }
      }
    }
  });

  it("returns null outside the table", () => {
    expect(adToBs("1943-04-13")).toBeNull();
    expect(bsToAd(BS_MIN_YEAR - 1, 0, 1)).toBeNull();
    expect(bsToAd(BS_MAX_YEAR + 1, 0, 1)).toBeNull();
    expect(bsToAd(2083, 13, 1)).toBeNull();
    expect(bsToAd(2083, 0, 32)).toBeNull();
  });
});

describe("month helpers", () => {
  it("spans a BS month in AD dates", () => {
    // Bhadra 2083 runs 17 Aug – 16 Sep 2026.
    expect(bsMonthAdRange(2083, 4)).toEqual({
      from: "2026-08-17",
      to: "2026-09-16",
    });
  });

  it("finds the month containing a date", () => {
    expect(bsMonthOf("2026-08-30")).toEqual({ year: 2083, month: 4 });
    expect(bsMonthOf("2026-08-16")).toEqual({ year: 2083, month: 3 });
  });

  it("shifts months across year boundaries", () => {
    expect(shiftBsMonth(2083, 0, -1)).toEqual({ year: 2082, month: 11 });
    expect(shiftBsMonth(2083, 11, 1)).toEqual({ year: 2084, month: 0 });
    expect(shiftBsMonth(2083, 4, 12)).toEqual({ year: 2084, month: 4 });
  });

  it("clamps shifts to the table", () => {
    expect(shiftBsMonth(BS_MIN_YEAR, 0, -5)).toEqual({
      year: BS_MIN_YEAR,
      month: 0,
    });
    expect(shiftBsMonth(BS_MAX_YEAR, 11, 5)).toEqual({
      year: BS_MAX_YEAR,
      month: 11,
    });
  });

  it("counts year lengths sanely", () => {
    for (let y = BS_MIN_YEAR; y <= BS_MAX_YEAR; y++) {
      const days = yearDays(y);
      expect(days).toBeGreaterThanOrEqual(364);
      expect(days).toBeLessThanOrEqual(367);
    }
  });
});

describe("formatBsDate", () => {
  it("formats with weekday", () => {
    // 2026-08-30 was a Sunday.
    expect(formatBsDate("2026-08-30")).toBe("Sun, 14 Bhadra 2083");
  });

  it("passes through out-of-range keys", () => {
    expect(formatBsDate("1900-01-01")).toBe("1900-01-01");
  });
});
