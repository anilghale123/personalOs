import { describe, it, expect } from "vitest";
import { vapidSubject } from "./push";

describe("vapidSubject", () => {
  it("adds mailto: to a bare email — web-push rejects it otherwise", () => {
    expect(vapidSubject("anil@example.com")).toBe("mailto:anil@example.com");
  });

  it("keeps a subject that already has a scheme", () => {
    expect(vapidSubject("mailto:anil@example.com")).toBe("mailto:anil@example.com");
    expect(vapidSubject("https://selfview.app")).toBe("https://selfview.app");
  });

  it("strips stray quotes and spaces pasted into the env var", () => {
    expect(vapidSubject(' "anil@example.com" ')).toBe("mailto:anil@example.com");
  });

  it("falls back when unset", () => {
    expect(vapidSubject(undefined)).toBe("mailto:admin@example.com");
    expect(vapidSubject("")).toBe("mailto:admin@example.com");
  });
});
