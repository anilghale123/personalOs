import { describe, expect, it } from "vitest";
import {
  addMinor,
  formatUnits,
  fromMinorUnits,
  fromScaledUnits,
  holdingValuePaisa,
  percentOf,
  sumMinor,
  toMinorUnits,
  toScaledUnits,
  UNIT_SCALE,
  unitsFor,
} from "./money";

describe("toMinorUnits / fromMinorUnits", () => {
  it("round-trips a typical amount losslessly", () => {
    for (const rupees of [0.01, 1, 99.99, 450.5, 12345.67]) {
      expect(fromMinorUnits(toMinorUnits(rupees))).toBeCloseTo(rupees, 10);
    }
  });

  it("always returns an integer", () => {
    for (const v of [0.005, 1.004, 1.005, 99.999]) {
      expect(Number.isInteger(toMinorUnits(v))).toBe(true);
    }
  });

  it("returns 0 for non-finite input rather than NaN", () => {
    expect(toMinorUnits(NaN)).toBe(0);
    expect(toMinorUnits(Infinity)).toBe(0);
    expect(toMinorUnits("abc")).toBe(0);
    expect(toMinorUnits(undefined)).toBe(0);
  });

  it("avoids the classic float error that motivates integer paisa", () => {
    // 0.1 + 0.2 !== 0.3 in floats; in paisa it is exact.
    expect(addMinor(toMinorUnits(0.1), toMinorUnits(0.2))).toBe(
      toMinorUnits(0.3)
    );
  });
});

describe("sumMinor / addMinor", () => {
  it("sums entries and treats missing amounts as zero", () => {
    expect(sumMinor([{ amountPaisa: 100 }, { amountPaisa: 250 }])).toBe(350);
    expect(sumMinor([{ amountPaisa: 100 }, {}])).toBe(100);
    expect(sumMinor([])).toBe(0);
  });

  it("ignores non-numeric amounts instead of producing NaN", () => {
    expect(sumMinor([{ amountPaisa: 100 }, { amountPaisa: "x" }])).toBe(100);
    expect(addMinor(100, null, undefined, NaN, 50)).toBe(150);
  });
});

describe("unitsFor", () => {
  it("computes scaled units for a clean division", () => {
    // NPR 1000 at NPR 10 per unit = 100 units.
    expect(unitsFor(100_000, 1_000)).toBe(100 * UNIT_SCALE);
  });

  it("rounds a fractional result to four decimal places", () => {
    // NPR 1000 at NPR 12.37 → 80.8407... units
    const scaled = unitsFor(toMinorUnits(1000), toMinorUnits(12.37));
    expect(fromScaledUnits(scaled)).toBeCloseTo(80.8407, 4);
    expect(Number.isInteger(scaled)).toBe(true);
  });

  it("returns 0 instead of NaN or Infinity on a bad NAV", () => {
    // This exact case — a missing NAV — is what used to write NaN into
    // unitsPurchased and silently poison every portfolio total.
    expect(unitsFor(100_000, 0)).toBe(0);
    expect(unitsFor(100_000, undefined)).toBe(0);
    expect(unitsFor(100_000, null)).toBe(0);
    expect(unitsFor(100_000, NaN)).toBe(0);
    expect(unitsFor(100_000, -5)).toBe(0);
    expect(unitsFor(NaN, 1_000)).toBe(0);
  });

  it("never yields a non-finite value for any input", () => {
    const inputs = [0, 1, -1, NaN, Infinity, -Infinity, null, undefined, "x"];
    for (const a of inputs) {
      for (const b of inputs) {
        expect(Number.isFinite(unitsFor(a, b))).toBe(true);
      }
    }
  });
});

describe("holdingValuePaisa", () => {
  it("values a holding in whole paisa", () => {
    // 100 units at NPR 12.50 = NPR 1250
    const units = toScaledUnits(100);
    expect(holdingValuePaisa(units, toMinorUnits(12.5))).toBe(toMinorUnits(1250));
  });

  it("returns an integer paisa amount even for fractional units", () => {
    const units = toScaledUnits(80.8407);
    const value = holdingValuePaisa(units, toMinorUnits(12.37));
    expect(Number.isInteger(value)).toBe(true);
    expect(fromMinorUnits(value)).toBeCloseTo(1000, 0);
  });

  it("is 0 on non-finite input", () => {
    expect(holdingValuePaisa(NaN, 100)).toBe(0);
    expect(holdingValuePaisa(100, undefined)).toBe(0);
  });
});

describe("formatUnits", () => {
  it("trims trailing zeros but keeps real precision", () => {
    expect(formatUnits(toScaledUnits(100))).toBe("100");
    expect(formatUnits(toScaledUnits(80.8407))).toBe("80.8407");
  });
});

describe("percentOf", () => {
  it("is safe on a zero whole", () => {
    expect(percentOf(50, 0)).toBe(0);
  });

  it("reports one decimal place", () => {
    expect(percentOf(1, 3)).toBe(33.3);
    expect(percentOf(50, 200)).toBe(25);
  });
});
