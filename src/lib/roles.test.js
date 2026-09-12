import { describe, expect, it } from "vitest";
import {
  ROLES,
  ROLE_ORDER,
  assignableRoles,
  canAccessAdmin,
  canActOn,
  canManageRoles,
  isValidRole,
  rankOf,
} from "./roles";

describe("rankOf — fails closed", () => {
  it("ranks unknown, missing and malformed roles as nothing", () => {
    // A typo'd or absent role must never outrank a real user.
    for (const value of [undefined, null, "", "administrator", "ADMIN", 42, {}]) {
      expect(rankOf(value)).toBe(0);
    }
  });

  it("orders the real roles", () => {
    expect(rankOf(ROLES.USER)).toBeLessThan(rankOf(ROLES.ADMIN));
    expect(rankOf(ROLES.ADMIN)).toBeLessThan(rankOf(ROLES.SUPERADMIN));
  });
});

describe("canAccessAdmin", () => {
  it("admits admins and superadmins only", () => {
    expect(canAccessAdmin(ROLES.ADMIN)).toBe(true);
    expect(canAccessAdmin(ROLES.SUPERADMIN)).toBe(true);
  });

  it("refuses ordinary and unknown roles", () => {
    for (const role of [ROLES.USER, undefined, null, "", "admin ", "Admin"]) {
      expect(canAccessAdmin(role)).toBe(false);
    }
  });
});

describe("canManageRoles", () => {
  it("is superadmin-only", () => {
    expect(canManageRoles(ROLES.SUPERADMIN)).toBe(true);
    expect(canManageRoles(ROLES.ADMIN)).toBe(false);
    expect(canManageRoles(ROLES.USER)).toBe(false);
    expect(canManageRoles(undefined)).toBe(false);
  });
});

describe("canActOn — only strictly below you", () => {
  it("lets a superadmin act on admins and users", () => {
    expect(canActOn(ROLES.SUPERADMIN, ROLES.ADMIN)).toBe(true);
    expect(canActOn(ROLES.SUPERADMIN, ROLES.USER)).toBe(true);
  });

  it("lets an admin act on users only", () => {
    expect(canActOn(ROLES.ADMIN, ROLES.USER)).toBe(true);
    expect(canActOn(ROLES.ADMIN, ROLES.ADMIN)).toBe(false);
    expect(canActOn(ROLES.ADMIN, ROLES.SUPERADMIN)).toBe(false);
  });

  it("never lets equal ranks act on each other", () => {
    // Which is also what stops anyone acting on themselves — the case that
    // would let the last superadmin demote themselves and lock everyone out.
    for (const role of ROLE_ORDER) {
      expect(canActOn(role, role)).toBe(false);
    }
  });

  it("refuses an ordinary user acting on anyone", () => {
    for (const target of ROLE_ORDER) {
      expect(canActOn(ROLES.USER, target)).toBe(false);
    }
  });

  it("refuses when either role is unknown", () => {
    expect(canActOn(undefined, ROLES.USER)).toBe(false);
    expect(canActOn("hacker", ROLES.USER)).toBe(false);
    // An unknown *target* ranks 0, so a real admin still outranks it — that is
    // correct: a corrupted role value should not become untouchable.
    expect(canActOn(ROLES.ADMIN, "nonsense")).toBe(true);
  });
});

describe("assignableRoles", () => {
  it("lets a superadmin assign admin and user, but not superadmin", () => {
    // Creating another superadmin stays a deliberate database act, so one
    // compromised session cannot mint a permanent peer.
    const roles = assignableRoles(ROLES.SUPERADMIN);
    expect(roles).toContain(ROLES.USER);
    expect(roles).toContain(ROLES.ADMIN);
    expect(roles).not.toContain(ROLES.SUPERADMIN);
  });

  it("gives an admin nothing to assign", () => {
    expect(assignableRoles(ROLES.ADMIN)).toEqual([]);
    expect(assignableRoles(ROLES.USER)).toEqual([]);
    expect(assignableRoles(undefined)).toEqual([]);
  });

  it("only ever returns real roles", () => {
    for (const role of assignableRoles(ROLES.SUPERADMIN)) {
      expect(isValidRole(role)).toBe(true);
    }
  });
});

describe("isValidRole", () => {
  it("accepts exactly the three roles", () => {
    expect(ROLE_ORDER).toHaveLength(3);
    for (const role of ROLE_ORDER) expect(isValidRole(role)).toBe(true);
  });

  it("rejects anything else, including case variants", () => {
    for (const value of ["Admin", "SUPERADMIN", "owner", "", null, undefined]) {
      expect(isValidRole(value)).toBe(false);
    }
  });
});
