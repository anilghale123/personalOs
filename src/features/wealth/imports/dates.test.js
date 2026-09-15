import { describe, expect, it } from "vitest";
import { bsToAd } from "@/lib/nepali-date";
import { parseStatementDate } from "./dates";

describe("parseStatementDate", () => {
  it.each([
    ["2026-07-12", "2026-07-12"],
    ["2026/07/12 10:15:22", "2026-07-12"],
    ["12/07/2026", "2026-07-12"],
    ["05/07/2026", "2026-07-05"], // DD/MM by default
    ["07/13/2026", "2026-07-13"], // MM/DD only when day can't be a month
    ["12-07-26", "2026-07-12"],
    ["12-Jul-2026", "2026-07-12"],
    ["12 Jul 26", "2026-07-12"],
    ["Jul 12, 2026", "2026-07-12"],
    ["12.07.2026", "2026-07-12"],
  ])("%s → %s", (text, expected) => {
    expect(parseStatementDate(text)?.date).toBe(expected);
  });

  it("converts Bikram Sambat dates to AD", () => {
    const result = parseStatementDate("2083-03-27");
    expect(result.date).toBe(bsToAd(2083, 2, 27));
    expect(result.date).toMatch(/^2026-07-\d{2}$/);
  });

  it("reports where the date sits, so trailing text can be kept", () => {
    expect(parseStatementDate("2026-07-02 MB/ESEWA")).toEqual({ date: "2026-07-02", index: 0, end: 10 });
  });

  it.each(["500.00", "9801234567", "MB/ESEWA/Load", "31/02/2026", "12,500.00", ""])(
    "rejects %s",
    (text) => {
      expect(parseStatementDate(text)).toBeNull();
    }
  );
});
