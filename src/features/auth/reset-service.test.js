import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { hashToken, hashesMatch, RESET_EXPIRY_MINUTES } from "./reset-service";

/**
 * The DB-touching half of this module (issue/claim/invalidate) needs a live
 * Mongo and is covered by the integration script; these tests pin the pure
 * cryptographic properties, which are the ones that are silently wrong if
 * they are wrong at all.
 */

describe("hashToken", () => {
  it("produces a stable 64-char sha256 hex digest", () => {
    const h = hashToken("abc");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken("abc")).toBe(h);
  });

  it("never returns the token itself — the database must not hold it", () => {
    const token = crypto.randomBytes(32).toString("base64url");
    const h = hashToken(token);
    expect(h).not.toContain(token);
    expect(h).not.toBe(token);
  });

  it("changes completely for a one-character difference", () => {
    const a = hashToken("token-a");
    const b = hashToken("token-b");
    expect(a).not.toBe(b);
    // Avalanche: essentially no shared prefix.
    let shared = 0;
    while (shared < a.length && a[shared] === b[shared]) shared++;
    expect(shared).toBeLessThan(8);
  });
});

describe("hashesMatch", () => {
  it("matches identical digests", () => {
    const h = hashToken("same");
    expect(hashesMatch(h, h)).toBe(true);
  });

  it("rejects different digests", () => {
    expect(hashesMatch(hashToken("a"), hashToken("b"))).toBe(false);
  });

  it("returns false on a length mismatch instead of throwing", () => {
    // timingSafeEqual throws on unequal lengths — the guard must catch that
    // before it becomes a 500 on a malformed token.
    expect(() => hashesMatch("short", hashToken("long"))).not.toThrow();
    expect(hashesMatch("short", hashToken("long"))).toBe(false);
    expect(hashesMatch("", "")).toBe(true);
  });
});

describe("token entropy", () => {
  it("generates distinct, long, url-safe tokens", () => {
    const tokens = new Set();
    for (let i = 0; i < 500; i++) {
      tokens.add(crypto.randomBytes(32).toString("base64url"));
    }
    expect(tokens.size).toBe(500);
    for (const t of tokens) {
      expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(t.length).toBeGreaterThanOrEqual(42);
    }
  });
});

describe("expiry window", () => {
  it("is short enough to limit exposure and long enough to be usable", () => {
    expect(RESET_EXPIRY_MINUTES).toBeGreaterThanOrEqual(15);
    expect(RESET_EXPIRY_MINUTES).toBeLessThanOrEqual(60);
  });
});
