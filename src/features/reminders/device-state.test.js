import { describe, it, expect } from "vitest";
import { reminderState } from "./device-state";

/** A device with reminders genuinely on. */
const ON = {
  configured: true,
  ios: false,
  standalone: false,
  supported: true,
  permission: "granted",
  subscribed: true,
};

describe("reminderState", () => {
  it("is on when the browser is subscribed and allowed", () => {
    expect(reminderState(ON)).toBe("on");
  });

  /**
   * The regression this function exists for. Reminders used to be reported
   * off whenever the background re-registration request failed, so someone
   * who turned them on yesterday found the switch off today without ever
   * touching it. Nothing about the network reaches this decision now: the
   * only two inputs that can produce "off" from a working device are the
   * permission and the subscription, both of which change only when the
   * user (or the browser on their behalf) changes them.
   */
  it("goes off only when permission or the subscription is gone", () => {
    expect(reminderState({ ...ON, subscribed: false })).toBe("off");
    expect(reminderState({ ...ON, permission: "default" })).toBe("off");
    expect(reminderState({ ...ON, permission: "denied" })).toBe("denied");
  });

  /**
   * Reminders are only ever off because someone turned them off. When the
   * browser removes a subscription the user still wants — replacing it,
   * clearing it with site data, resetting the permission — the switch says
   * so, rather than reporting "off" as though it had been the user's choice.
   */
  it("reports a subscription the user still wants as interrupted, not off", () => {
    const wanted = { ...ON, wanted: true };
    expect(reminderState({ ...wanted, subscribed: false })).toBe("interrupted");
    expect(reminderState({ ...wanted, permission: "default", subscribed: false })).toBe(
      "interrupted"
    );
    // Working as normal is still simply "on".
    expect(reminderState(wanted)).toBe("on");
  });

  it("stays plainly off for someone who never turned reminders on, or turned them off", () => {
    expect(reminderState({ ...ON, subscribed: false, wanted: false })).toBe("off");
  });

  /** Blocked in browser settings is something only the user can undo there. */
  it("reports blocked notifications as denied even when they were wanted", () => {
    expect(reminderState({ ...ON, permission: "denied", wanted: true })).toBe("denied");
  });

  it("reports why the switch cannot be offered", () => {
    expect(reminderState({ ...ON, configured: false })).toBe("unconfigured");
    expect(reminderState({ ...ON, supported: false })).toBe("unsupported");
  });

  it("asks iOS to install the app first, in a tab but not on the Home Screen", () => {
    expect(reminderState({ ...ON, ios: true, standalone: false })).toBe("ios-install");
    expect(reminderState({ ...ON, ios: true, standalone: true })).toBe("on");
  });

  it("puts the missing-key notice ahead of every device-specific one", () => {
    expect(reminderState({ ...ON, configured: false, ios: true })).toBe("unconfigured");
  });
});
