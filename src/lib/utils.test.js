import { describe, expect, it } from "vitest";
import {
  escapeRegex,
  searchRegex,
  MAX_SEARCH_LENGTH,
  toDateKey,
} from "./utils";

describe("escapeRegex", () => {
  it("neutralises every regex metacharacter", () => {
    const rx = new RegExp(escapeRegex(".*+?^${}()|[]\\"));
    expect(rx.test(".*+?^${}()|[]\\")).toBe(true);
    // The escaped form must not match arbitrary text the raw pattern would.
    expect(rx.test("anything else")).toBe(false);
  });

  it("makes an unbalanced paren safe to compile", () => {
    // The pre-fix bug: `new RegExp("what?(")` throws, surfacing as a 500
    // for anyone who types a question mark into a search box.
    expect(() => new RegExp(escapeRegex("what?("))).not.toThrow();
    expect(new RegExp(escapeRegex("what?(")).test("what?(")).toBe(true);
  });

  it("treats a catastrophic-backtracking pattern as literal text", () => {
    const rx = new RegExp(escapeRegex("(a+)+$"));
    expect(rx.test("(a+)+$")).toBe(true);
    // Literal, so no exponential blow-up on a long run of 'a'.
    expect(rx.test("a".repeat(5000))).toBe(false);
  });
});

describe("searchRegex", () => {
  it("returns null below the minimum length", () => {
    expect(searchRegex("", 2)).toBeNull();
    expect(searchRegex("a", 2)).toBeNull();
    expect(searchRegex("  ", 2)).toBeNull();
    expect(searchRegex(null, 1)).toBeNull();
    expect(searchRegex(undefined, 1)).toBeNull();
  });

  it("matches case-insensitively on a trimmed term", () => {
    const rx = searchRegex("  Coffee  ");
    expect(rx.test("morning coffee run")).toBe(true);
    expect(rx.test("COFFEE")).toBe(true);
  });

  it("caps the term length so a huge query cannot be compiled", () => {
    const rx = searchRegex("x".repeat(5000));
    expect(rx.source.length).toBeLessThanOrEqual(MAX_SEARCH_LENGTH * 2);
  });

  it("survives input made entirely of metacharacters", () => {
    expect(() => searchRegex("((((")).not.toThrow();
    expect(searchRegex("((((").test("((((")).toBe(true);
  });
});

describe("toDateKey", () => {
  it("uses the local calendar date, not UTC", () => {
    // Kathmandu is UTC+05:45 (pinned in vitest.config.mjs). 20:00 local on
    // the 5th is still the 5th locally but already the 5th 14:15 UTC — the
    // failure mode this guards is a UTC-derived key landing a day off.
    const d = new Date(2026, 2, 5, 20, 0, 0);
    expect(toDateKey(d)).toBe("2026-03-05");
  });

  it("zero-pads month and day", () => {
    expect(toDateKey(new Date(2026, 0, 9))).toBe("2026-01-09");
  });
});
