import { describe, expect, it } from "vitest";
import {
  TRANSFERS,
  matchCategory,
  suggestExpenseCategory,
  suggestIncomeCategory,
} from "./categorize";

describe("suggestExpenseCategory", () => {
  it.each([
    ["spent 500 on momo", "Eating Out"],
    ["MB/ESEWA/9801234567/NT Prepaid topup", "Internet & Phone"],
    ["NT Prepaid 9841000000", "Internet & Phone"],
    ["MB/ESEWA/9801234567/Load", TRANSFERS],
    ["FT to 00101000999 RAM BAHADUR", TRANSFERS],
    ["NEA electricity bill", "Utilities"],
    ["pathao ride", "Transport"],
  ])("%s → %s", (text, expected) => {
    expect(suggestExpenseCategory(text)).toBe(expected);
  });

  it("does not match inside unrelated words", () => {
    // "parent" contains "rent"; "Deft" contains "ft".
    expect(suggestExpenseCategory("gift for parent")).toBe("Gifts & Donations");
    expect(suggestExpenseCategory("Deft store")).toBeNull();
  });

  it("returns null when nothing matches", () => {
    expect(suggestExpenseCategory("something unusual")).toBeNull();
    expect(suggestExpenseCategory("")).toBeNull();
  });
});

describe("suggestIncomeCategory", () => {
  it.each([
    ["SALARY FOR JULY 2026", "Salary"],
    ["income salary 35000", "Salary"],
    ["Interest Credit", "Interest"],
    ["FT from 0010100 HARI", "Transfer"],
    ["Cash deposit", "Other"],
    ["Fund Transfer from HARI", "Transfer"],
    ["ESEWA refund", "Refund"],
  ])("%s → %s", (text, expected) => {
    expect(suggestIncomeCategory(text)).toBe(expected);
  });
});

describe("matchCategory", () => {
  const cats = [
    { _id: "a", name: "Eating Out" },
    { _id: "b", name: "Mobile & Wallet" },
    { _id: "c", name: "Miscellaneous" },
    { _id: "d", name: "Old", isArchived: true },
  ];

  it("prefers an exact name", () => {
    expect(matchCategory(cats, "Eating Out")).toBe("a");
  });

  it("uses aliases when the default name is missing", () => {
    expect(matchCategory(cats, TRANSFERS)).toBe("b");
  });

  it("falls back to Miscellaneous, never to an archived category", () => {
    expect(matchCategory(cats, "Travel")).toBe("c");
    expect(matchCategory(cats, null)).toBe("c");
    expect(matchCategory([{ _id: "x", name: "Old", isArchived: true }], null)).toBe("");
  });
});
