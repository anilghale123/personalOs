import { describe, expect, it } from "vitest";
import { markAlreadyImported } from "./dedupe";

const item = (over = {}) => ({
  fingerprint: "a".repeat(40),
  date: "2026-07-03",
  direction: "withdraw",
  paisa: 10000,
  description: "NT Prepaid topup 9841000000",
  ...over,
});

describe("markAlreadyImported", () => {
  it("matches on fingerprint", () => {
    const result = markAlreadyImported([item()], {
      fingerprints: new Set(["a".repeat(40)]),
      existing: [],
    });
    expect(result).toEqual([true]);
  });

  it("matches rows saved without a fingerprint by date, amount and description", () => {
    const result = markAlreadyImported([item({ fingerprint: "b".repeat(40) })], {
      fingerprints: new Set(),
      existing: [{ kind: "expense", date: "2026-07-03", amountPaisa: 10000, note: "NT  Prepaid topup 9841000000" }],
    });
    expect(result).toEqual([true]);
  });

  it("counts content matches, so one saved copy covers only one identical row", () => {
    const rows = [item({ fingerprint: "1".repeat(40) }), item({ fingerprint: "2".repeat(40) })];
    const result = markAlreadyImported(rows, {
      fingerprints: new Set(),
      existing: [{ kind: "expense", date: "2026-07-03", amountPaisa: 10000, note: "NT Prepaid topup 9841000000" }],
    });
    expect(result).toEqual([true, false]);
  });

  it("does not confuse an expense with income of the same amount", () => {
    const result = markAlreadyImported([item({ direction: "deposit" })], {
      fingerprints: new Set(),
      existing: [{ kind: "expense", date: "2026-07-03", amountPaisa: 10000, note: "NT Prepaid topup 9841000000" }],
    });
    expect(result).toEqual([false]);
  });

  it("treats a different amount or date as new", () => {
    const existing = [{ kind: "expense", date: "2026-07-03", amountPaisa: 10000, note: "NT Prepaid topup 9841000000" }];
    expect(markAlreadyImported([item({ paisa: 20000 })], { fingerprints: new Set(), existing })).toEqual([false]);
    expect(markAlreadyImported([item({ date: "2026-07-04" })], { fingerprints: new Set(), existing })).toEqual([false]);
  });
});
