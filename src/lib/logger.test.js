import { describe, expect, it } from "vitest";
import { redact } from "./logger";

describe("redact", () => {
  it("removes passwords under every naming variant", () => {
    const out = redact({
      password: "hunter2",
      newPassword: "hunter3",
      currentPassword: "hunter1",
      passwordHash: "$2a$10$abcdef",
    });
    expect(JSON.stringify(out)).not.toContain("hunter");
    expect(JSON.stringify(out)).not.toContain("$2a$10$");
  });

  it("removes tokens, secrets and auth headers", () => {
    const out = redact({
      resetToken: "abc123",
      CRON_SECRET: "s3cret",
      authorization: "Bearer xyz",
      cookie: "session=1",
      apiKey: "gsk_live",
    });
    const s = JSON.stringify(out);
    for (const leak of ["abc123", "s3cret", "Bearer xyz", "session=1", "gsk_live"]) {
      expect(s).not.toContain(leak);
    }
  });

  it("removes private journal content and money amounts", () => {
    const out = redact({
      content: "today I felt awful about my debt",
      note: "private",
      amountPaisa: 45050,
      totalAmount: 99999,
      email: "nitisha@example.com",
    });
    const s = JSON.stringify(out);
    expect(s).not.toContain("felt awful");
    expect(s).not.toContain("45050");
    expect(s).not.toContain("nitisha@example.com");
  });

  it("keeps the fields that make a log useful", () => {
    const out = redact({
      route: "POST /api/budget/expenses",
      userId: "507f1f77bcf86cd799439011",
      ms: 42,
      status: 201,
      count: 3,
    });
    expect(out.route).toBe("POST /api/budget/expenses");
    expect(out.userId).toBe("507f1f77bcf86cd799439011");
    expect(out.ms).toBe(42);
    expect(out.count).toBe(3);
  });

  it("redacts nested objects, not just top-level keys", () => {
    const out = redact({ body: { user: { password: "leak-me" } } });
    expect(JSON.stringify(out)).not.toContain("leak-me");
  });

  it("redacts inside arrays of records", () => {
    const out = redact({ rows: [{ amountPaisa: 100 }, { amountPaisa: 200 }] });
    const s = JSON.stringify(out);
    expect(s).not.toContain("100");
    expect(s).not.toContain("200");
  });

  it("survives cyclic structures instead of hanging", () => {
    const a = { name: "a" };
    a.self = a;
    expect(() => redact(a)).not.toThrow();
  });

  it("truncates very long strings", () => {
    const out = redact({ title: "x".repeat(5000) });
    expect(out.title.length).toBeLessThan(400);
  });

  it("serialises Errors without dropping the message", () => {
    const out = redact({ err: new TypeError("bad thing") });
    expect(out.err).toEqual({ name: "TypeError", message: "bad thing" });
  });

  it("passes primitives and null through untouched", () => {
    expect(redact(null)).toBeNull();
    expect(redact(undefined)).toBeUndefined();
    expect(redact(5)).toBe(5);
    expect(redact(true)).toBe(true);
  });
});
