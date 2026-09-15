import { describe, expect, it } from "vitest";
import { isProUser, proEmailAllowlist } from "./plans";

describe("proEmailAllowlist", () => {
  it("splits, trims, lowercases and drops blanks", () => {
    expect(proEmailAllowlist(" A@x.com, ,b@Y.com ")).toEqual(["a@x.com", "b@y.com"]);
    expect(proEmailAllowlist(undefined)).toEqual([]);
  });
});

describe("isProUser", () => {
  it("is false for nobody and for a plain free user", () => {
    expect(isProUser(null, [])).toBe(false);
    expect(isProUser({ plan: "free", role: "user", email: "a@x.com" }, [])).toBe(false);
    expect(isProUser({ email: "a@x.com" }, [])).toBe(false);
  });

  it("is true for the pro plan", () => {
    expect(isProUser({ plan: "pro", role: "user" }, [])).toBe(true);
  });

  it("is true for admins so gated features can be tested", () => {
    expect(isProUser({ plan: "free", role: "admin" }, [])).toBe(true);
    expect(isProUser({ role: "superadmin" }, [])).toBe(true);
  });

  it("honours the email allowlist case-insensitively", () => {
    expect(isProUser({ plan: "free", email: "A@X.com" }, ["a@x.com"])).toBe(true);
  });
});
