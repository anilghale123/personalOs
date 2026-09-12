import { describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { plain } from "./serialize";

/**
 * These assert `plain` is a drop-in replacement for the
 * `JSON.parse(JSON.stringify(x))` it replaced, because anything it converts
 * differently reaches a client component as a subtly different value.
 */
const viaJson = (v) => JSON.parse(JSON.stringify(v));

describe("plain", () => {
  it("stringifies ObjectIds", () => {
    const id = new mongoose.Types.ObjectId("507f1f77bcf86cd799439011");
    expect(plain({ _id: id })).toEqual({ _id: "507f1f77bcf86cd799439011" });
  });

  it("converts Dates to ISO strings", () => {
    const d = new Date("2026-03-05T14:15:00.000Z");
    expect(plain({ createdAt: d })).toEqual({
      createdAt: "2026-03-05T14:15:00.000Z",
    });
  });

  it("drops undefined properties rather than nulling them", () => {
    // The distinction matters: a component reading `value ?? fallback` takes
    // the fallback for undefined but keeps null.
    const out = plain({ a: 1, b: undefined });
    expect("b" in out).toBe(false);
    expect(out).toEqual(viaJson({ a: 1, b: undefined }));
  });

  it("preserves explicit nulls", () => {
    expect(plain({ mood: null })).toEqual({ mood: null });
  });

  it("recurses through nested objects and arrays", () => {
    const id = new mongoose.Types.ObjectId("507f1f77bcf86cd799439011");
    const input = {
      _id: id,
      entries: [
        { amountPaisa: 100, date: new Date("2026-01-01T00:00:00.000Z") },
        { amountPaisa: 250, nested: { deep: id } },
      ],
    };
    expect(plain(input)).toEqual({
      _id: "507f1f77bcf86cd799439011",
      entries: [
        { amountPaisa: 100, date: "2026-01-01T00:00:00.000Z" },
        { amountPaisa: 250, nested: { deep: "507f1f77bcf86cd799439011" } },
      ],
    });
  });

  it("handles a top-level array of documents", () => {
    const id = new mongoose.Types.ObjectId("507f1f77bcf86cd799439011");
    expect(plain([{ _id: id }, { _id: id }])).toEqual([
      { _id: "507f1f77bcf86cd799439011" },
      { _id: "507f1f77bcf86cd799439011" },
    ]);
  });

  it("agrees with JSON round-tripping on a realistic lean document", () => {
    const doc = {
      _id: new mongoose.Types.ObjectId("507f1f77bcf86cd799439011"),
      userId: new mongoose.Types.ObjectId("607f1f77bcf86cd799439022"),
      amountPaisa: 45050,
      note: "coffee",
      tags: ["food", "out"],
      deletedAt: null,
      createdAt: new Date("2026-03-05T14:15:00.000Z"),
      recurrence: { frequency: "monthly", dayOfMonth: 1 },
    };
    expect(plain(doc)).toEqual(viaJson(doc));
  });

  it("passes primitives through untouched", () => {
    expect(plain(5)).toBe(5);
    expect(plain("x")).toBe("x");
    expect(plain(true)).toBe(true);
    expect(plain(null)).toBeNull();
    expect(plain(undefined)).toBeUndefined();
  });

  it("returns an ISO string for a bare Date", () => {
    expect(plain(new Date("2026-03-05T00:00:00.000Z"))).toBe(
      "2026-03-05T00:00:00.000Z"
    );
  });

  it("does not preserve numeric precision loss", () => {
    // Integer paisa must survive exactly — this is money.
    expect(plain({ amountPaisa: 999_999_999 }).amountPaisa).toBe(999_999_999);
  });
});
