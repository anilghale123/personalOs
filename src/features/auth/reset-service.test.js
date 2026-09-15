import { beforeAll, describe, expect, it } from "vitest";
import {
  CODE_LENGTH,
  MAX_ATTEMPTS,
  RESEND_COOLDOWN_SEC,
  RESET_EXPIRY_MINUTES,
  generateCode,
  hashCode,
  hashesMatch,
} from "./reset-service";

/**
 * The DB-touching half (issue/consume/invalidate) needs a live Mongo; these
 * tests pin the pure cryptographic and policy properties, which are the ones
 * that are silently wrong if they are wrong at all.
 */

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-that-is-at-least-32-characters-long";
});

describe("generateCode", () => {
  it("is always exactly CODE_LENGTH digits, zero-padded", () => {
    for (let i = 0; i < 2000; i++) {
      expect(generateCode()).toMatch(new RegExp(`^\\d{${CODE_LENGTH}}$`));
    }
  });

  it("is not trivially repetitive", () => {
    const codes = new Set(Array.from({ length: 500 }, generateCode));
    expect(codes.size).toBeGreaterThan(480);
  });
});

describe("hashCode", () => {
  it("is a stable hex digest that never contains the code", () => {
    const h = hashCode("user1", "123456");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashCode("user1", "123456")).toBe(h);
    expect(h).not.toContain("123456");
  });

  it("binds the code to the user", () => {
    expect(hashCode("user1", "123456")).not.toBe(hashCode("user2", "123456"));
  });

  it("depends on the secret, so a dump cannot be brute-forced offline", () => {
    const before = hashCode("user1", "000000");
    const original = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = "a-different-secret-that-is-also-long-enough";
    try {
      expect(hashCode("user1", "000000")).not.toBe(before);
    } finally {
      process.env.AUTH_SECRET = original;
    }
  });
});

describe("hashesMatch", () => {
  it("matches identical digests and rejects different ones", () => {
    const h = hashCode("u", "111111");
    expect(hashesMatch(h, h)).toBe(true);
    expect(hashesMatch(h, hashCode("u", "111112"))).toBe(false);
  });

  it("returns false on a length mismatch instead of throwing", () => {
    expect(() => hashesMatch("short", hashCode("u", "1"))).not.toThrow();
    expect(hashesMatch("short", hashCode("u", "1"))).toBe(false);
  });
});

describe("policy", () => {
  it("keeps the expiry between 10 and 15 minutes", () => {
    expect(RESET_EXPIRY_MINUTES).toBeGreaterThanOrEqual(10);
    expect(RESET_EXPIRY_MINUTES).toBeLessThanOrEqual(15);
  });

  it("bounds guessing to a negligible fraction of the code space", () => {
    // Worst case per hour: one code per cooldown window, each with
    // MAX_ATTEMPTS guesses.
    const guessesPerHour = (3600 / RESEND_COOLDOWN_SEC) * MAX_ATTEMPTS;
    expect(guessesPerHour / 10 ** CODE_LENGTH).toBeLessThan(0.001);
  });
});
