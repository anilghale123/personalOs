import { describe, it, expect } from "vitest";
import {
  compareMonthCursors,
  currentMonthCursor,
  cursorForDateKey,
  exactMonthCursor,
  monthCursorLabel,
  monthCursorRange,
  shiftMonthCursor,
} from "./months";

describe("english month cursors", () => {
  it("covers a 31-day month exactly", () => {
    const cursor = { cal: "en", year: 2026, month: 7 }; // August
    expect(monthCursorRange(cursor)).toEqual({
      from: "2026-08-01",
      to: "2026-08-31",
    });
    expect(monthCursorLabel(cursor)).toBe("August 2026");
  });

  it("covers February in a leap year", () => {
    expect(monthCursorRange({ cal: "en", year: 2024, month: 1 })).toEqual({
      from: "2024-02-01",
      to: "2024-02-29",
    });
  });

  it("shifts across year boundaries", () => {
    expect(shiftMonthCursor({ cal: "en", year: 2026, month: 0 }, -1)).toEqual({
      cal: "en",
      year: 2025,
      month: 11,
    });
    expect(shiftMonthCursor({ cal: "en", year: 2026, month: 11 }, 1)).toEqual({
      cal: "en",
      year: 2027,
      month: 0,
    });
  });
});

describe("nepali month cursors", () => {
  it("resolves a BS month to its AD span", () => {
    const cursor = { cal: "np", year: 2083, month: 4 }; // Bhadra
    expect(monthCursorRange(cursor)).toEqual({
      from: "2026-08-17",
      to: "2026-09-16",
    });
    expect(monthCursorLabel(cursor)).toBe("Bhadra 2083");
  });

  it("shifts within the BS calendar", () => {
    expect(shiftMonthCursor({ cal: "np", year: 2083, month: 0 }, -1)).toEqual({
      cal: "np",
      year: 2082,
      month: 11,
    });
  });

  it("finds the cursor for a date key in each calendar", () => {
    expect(cursorForDateKey("2026-08-30", "en")).toEqual({
      cal: "en",
      year: 2026,
      month: 7,
    });
    expect(cursorForDateKey("2026-08-30", "np")).toEqual({
      cal: "np",
      year: 2083,
      month: 4,
    });
  });

  it("falls back to English outside the BS table", () => {
    expect(cursorForDateKey("1900-05-02", "np")).toEqual({
      cal: "en",
      year: 1900,
      month: 4,
    });
  });
});

describe("exactMonthCursor", () => {
  it("recognises an exact month range", () => {
    expect(exactMonthCursor("2026-08-01", "2026-08-31", "en")).toEqual({
      cal: "en",
      year: 2026,
      month: 7,
    });
    expect(exactMonthCursor("2026-08-17", "2026-09-16", "np")).toEqual({
      cal: "np",
      year: 2083,
      month: 4,
    });
  });

  it("rejects partial or open ranges", () => {
    expect(exactMonthCursor("2026-08-01", "2026-08-30", "en")).toBeNull();
    expect(exactMonthCursor("", "", "en")).toBeNull();
    expect(exactMonthCursor("2026-08-01", "", "en")).toBeNull();
  });
});

describe("compareMonthCursors", () => {
  it("orders by real time across calendars", () => {
    const en = { cal: "en", year: 2026, month: 7 }; // Aug 1
    const np = { cal: "np", year: 2083, month: 4 }; // Aug 17
    expect(compareMonthCursors(en, np)).toBe(-1);
    expect(compareMonthCursors(np, en)).toBe(1);
    expect(compareMonthCursors(en, en)).toBe(0);
  });

  it("anchors the current month to the calendar", () => {
    expect(currentMonthCursor("np", "2026-08-30")).toEqual({
      cal: "np",
      year: 2083,
      month: 4,
    });
  });
});
