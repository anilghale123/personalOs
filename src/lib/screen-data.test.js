import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  clearScreenData,
  invalidateScreens,
  markRead,
  shouldRead,
} from "@/lib/screen-data";

const USER = "6512aa00bb11cc22dd33ee44";
const OTHER = "6512aa00bb11cc22dd33ee99";

beforeEach(() => {
  clearScreenData();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * The cache policy, which is what makes moving between screens feel like
 * moving rather than loading: a screen already held is not re-read just
 * because it was opened again. See lib/screen-data.js.
 */
describe("shouldRead", () => {
  it("reads when there is nothing held", () => {
    expect(shouldRead(USER, "money", false)).toBe(true);
  });

  it("does not read again once something has been read", () => {
    markRead(USER, "money");
    expect(shouldRead(USER, "money", true)).toBe(false);
  });

  /** The whole point: opening a tab repeatedly costs nothing. */
  it("stays quiet across repeated opens", () => {
    markRead(USER, "money");
    for (let i = 0; i < 20; i++) {
      vi.advanceTimersByTime(1000);
      expect(shouldRead(USER, "money", true)).toBe(false);
    }
  });

  it("reads again once the copy has aged out", () => {
    markRead(USER, "money");
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    expect(shouldRead(USER, "money", true)).toBe(true);
  });

  it("never reads for a user that is not known yet", () => {
    expect(shouldRead(null, "money", false)).toBe(false);
  });
});

describe("invalidateScreens", () => {
  it("makes a screen read again after a write that affects it", () => {
    markRead(USER, "money");
    expect(shouldRead(USER, "money", true)).toBe(false);

    invalidateScreens("money");
    expect(shouldRead(USER, "money", true)).toBe(true);
  });

  it("leaves screens the write did not affect alone", () => {
    markRead(USER, "money");
    markRead(USER, "portfolio");

    invalidateScreens("money");
    expect(shouldRead(USER, "portfolio", true)).toBe(false);
  });

  /**
   * The home briefing is drawn from expenses, goals, habits and the journal
   * alike, so no write in this app leaves it untouched.
   */
  it("always includes the home screen", () => {
    markRead(USER, "home");
    invalidateScreens("portfolio");
    expect(shouldRead(USER, "home", true)).toBe(true);
  });

  /** `planner` has to reach `planner:2026-09-14` and every other week. */
  it("matches by prefix, so per-week keys are covered", () => {
    markRead(USER, "planner:2026-09-14");
    markRead(USER, "planner:2026-09-21");

    invalidateScreens("planner");
    expect(shouldRead(USER, "planner:2026-09-14", true)).toBe(true);
    expect(shouldRead(USER, "planner:2026-09-21", true)).toBe(true);
  });

  it("does not mistake one key for another that merely starts the same", () => {
    markRead(USER, "expenses-meta");
    invalidateScreens("expenses");
    expect(shouldRead(USER, "expenses-meta", true)).toBe(false);
  });

  /**
   * What keeps a shared device honest.
   *
   * Entries are filed under the user id, and `signOutEverywhere` calls
   * `clearScreenData` — so two accounts never hold entries here at the same
   * time, and the next person to sign in starts with nothing held rather
   * than inheriting the last one's idea of what is fresh.
   */
  it("clears everything on sign-out, so the next account starts cold", () => {
    markRead(USER, "money");
    expect(shouldRead(USER, "money", true)).toBe(false);

    clearScreenData();

    expect(shouldRead(USER, "money", true)).toBe(true);
    expect(shouldRead(OTHER, "money", true)).toBe(true);
  });
});
