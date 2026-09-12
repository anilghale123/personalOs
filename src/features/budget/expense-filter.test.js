import { describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { buildExpenseFilter } from "./expense-filter";

const USER = "507f1f77bcf86cd799439011";
const CATEGORY = "607f1f77bcf86cd799439022";

describe("buildExpenseFilter", () => {
  it("always scopes to the user and excludes soft-deleted rows", () => {
    const f = buildExpenseFilter(USER, {});
    expect(f.userId).toBe(USER);
    expect(f.deletedAt).toBeNull();
  });

  it("casts ids to ObjectId for aggregation but not for find", () => {
    // The whole point: a string in an aggregate $match matches nothing, so
    // the total would be 0 while the listed rows looked correct.
    const forFind = buildExpenseFilter(USER, { categoryId: CATEGORY });
    expect(typeof forFind.userId).toBe("string");
    expect(typeof forFind.categoryId).toBe("string");

    const forAgg = buildExpenseFilter(
      USER,
      { categoryId: CATEGORY },
      { forAggregation: true }
    );
    expect(forAgg.userId).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(forAgg.categoryId).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(String(forAgg.userId)).toBe(USER);
    expect(String(forAgg.categoryId)).toBe(CATEGORY);
  });

  it("produces identical non-id clauses in both modes", () => {
    const query = {
      paymentMethod: "cash",
      dateFrom: "2026-01-01",
      dateTo: "2026-01-31",
      tag: "food",
    };
    const a = buildExpenseFilter(USER, query);
    const b = buildExpenseFilter(USER, query, { forAggregation: true });

    // If these ever diverge, the page total stops describing the page.
    expect(a.paymentMethod).toBe(b.paymentMethod);
    expect(a.date).toEqual(b.date);
    expect(a.tags).toBe(b.tags);
  });

  it("builds an inclusive date range", () => {
    const f = buildExpenseFilter(USER, {
      dateFrom: "2026-01-01",
      dateTo: "2026-01-31",
    });
    expect(f.date).toEqual({ $gte: "2026-01-01", $lte: "2026-01-31" });
  });

  it("supports an open-ended range in either direction", () => {
    expect(buildExpenseFilter(USER, { dateFrom: "2026-01-01" }).date).toEqual({
      $gte: "2026-01-01",
    });
    expect(buildExpenseFilter(USER, { dateTo: "2026-01-31" }).date).toEqual({
      $lte: "2026-01-31",
    });
  });

  it("omits the date clause entirely when unfiltered", () => {
    expect(buildExpenseFilter(USER, {}).date).toBeUndefined();
  });

  it("escapes the note search rather than interpolating it", () => {
    const f = buildExpenseFilter(USER, { q: "what?(" });
    expect(f.note).toBeInstanceOf(RegExp);
    // Literal match, not a compiled pattern.
    expect(f.note.test("what?(")).toBe(true);
    expect(f.note.test("whatX")).toBe(false);
  });

  it("does not add a note clause for a blank search", () => {
    expect(buildExpenseFilter(USER, { q: "" }).note).toBeUndefined();
    expect(buildExpenseFilter(USER, { q: "   " }).note).toBeUndefined();
    expect(buildExpenseFilter(USER, {}).note).toBeUndefined();
  });

  it("never lets a filter drop the user scope", () => {
    // Guards against a future refactor that spreads query params over the
    // filter and lets a crafted `userId` param through.
    const f = buildExpenseFilter(USER, {
      userId: "deadbeefdeadbeefdeadbeef",
      deletedAt: { $ne: null },
    });
    expect(f.userId).toBe(USER);
    expect(f.deletedAt).toBeNull();
  });
});
