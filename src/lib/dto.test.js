import { describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { dto, pick, toId } from "./dto";

describe("pick", () => {
  it("keeps only allowlisted fields and drops internals", () => {
    const id = new mongoose.Types.ObjectId();
    const doc = {
      _id: id,
      amountPaisa: 500,
      userId: new mongoose.Types.ObjectId(),
      __v: 0,
      deletedAt: null,
      createdAt: new Date("2026-01-02T03:04:05Z"),
    };
    const out = pick(doc, ["_id", "amountPaisa", "createdAt"]);
    expect(out).toEqual({
      _id: String(id),
      amountPaisa: 500,
      createdAt: "2026-01-02T03:04:05.000Z",
    });
    expect(out).not.toHaveProperty("userId");
    expect(out).not.toHaveProperty("__v");
  });

  it("omits fields the document does not have", () => {
    expect(pick({ a: 1 }, ["a", "b"])).toEqual({ a: 1 });
  });

  it("returns null for a missing document", () => {
    expect(pick(null, ["a"])).toBeNull();
  });
});

describe("dto", () => {
  it("exposes its field list and maps consistently", () => {
    const toThing = dto(["name"]);
    expect(toThing.fields).toEqual(["name"]);
    expect(toThing({ name: "x", secret: "y" })).toEqual({ name: "x" });
  });
});

describe("toId", () => {
  it("stringifies ids and passes null through", () => {
    const id = new mongoose.Types.ObjectId();
    expect(toId(id)).toBe(String(id));
    expect(toId(null)).toBeNull();
    expect(toId(undefined)).toBeNull();
  });
});
