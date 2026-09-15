import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SNAPSHOT_MAX_AGE_MS,
  clearSnapshots,
  readSnapshot,
  sameData,
  writeSnapshot,
} from "./snapshot";

/** A minimal in-memory stand-in for window.localStorage. */
function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
}

beforeEach(() => {
  globalThis.window = { localStorage: memoryStorage() };
});

afterEach(() => {
  delete globalThis.window;
  vi.restoreAllMocks();
});

describe("snapshots", () => {
  it("round-trips data for the same user", () => {
    writeSnapshot("u1", "planner:2026-09-14", [{ title: "Run" }]);
    expect(readSnapshot("u1", "planner:2026-09-14")).toEqual([{ title: "Run" }]);
  });

  it("never shows one user's copy to another", () => {
    writeSnapshot("u1", "home", { name: "Anil" });
    expect(readSnapshot("u2", "home")).toBeUndefined();
  });

  it("does nothing without a user", () => {
    writeSnapshot(null, "home", { a: 1 });
    expect(window.localStorage.length).toBe(0);
    expect(readSnapshot(undefined, "home")).toBeUndefined();
  });

  it("uses the pos- prefix that sign-out already clears", () => {
    writeSnapshot("u1", "home", {});
    expect(window.localStorage.key(0)).toMatch(/^pos-/);
  });

  it("drops copies older than the max age", () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    writeSnapshot("u1", "home", { a: 1 });

    Date.now.mockReturnValue(now + SNAPSHOT_MAX_AGE_MS + 1);
    expect(readSnapshot("u1", "home")).toBeUndefined();
    expect(window.localStorage.length).toBe(0);
  });

  it("clears old copies and retries when storage is full", () => {
    writeSnapshot("u1", "old", { big: true });
    const store = window.localStorage;
    const realSet = store.setItem;
    let calls = 0;
    store.setItem = (k, v) => {
      calls += 1;
      if (calls === 1) throw new Error("QuotaExceededError");
      realSet(k, v);
    };

    writeSnapshot("u1", "new", { fresh: true });
    expect(readSnapshot("u1", "old")).toBeUndefined();
    expect(readSnapshot("u1", "new")).toEqual({ fresh: true });
  });

  it("clearSnapshots leaves unrelated keys alone", () => {
    window.localStorage.setItem("pos-theme", "dark");
    writeSnapshot("u1", "home", {});
    clearSnapshots();
    expect(window.localStorage.getItem("pos-theme")).toBe("dark");
    expect(window.localStorage.length).toBe(1);
  });

  it("tolerates corrupt entries", () => {
    window.localStorage.setItem("pos-snap:v1:u1:home", "{not json");
    expect(readSnapshot("u1", "home")).toBeUndefined();
  });
});

describe("sameData", () => {
  it("compares by content", () => {
    expect(sameData({ a: [1, 2] }, { a: [1, 2] })).toBe(true);
    expect(sameData({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
    expect(sameData(undefined, { a: 1 })).toBe(false);
  });
});
