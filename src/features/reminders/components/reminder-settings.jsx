"use client";

import { BellRing, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePushReminders } from "../use-push-reminders";

/** Why the switch can't be shown, per state. */
const NOTICES = {
  loading: "Checking this device…",
  unconfigured: "Reminders aren't set up on this server yet.",
  "ios-install":
    "On iPhone and iPad, reminders need the app on your Home Screen: tap Share → Add to Home Screen, open it from there, then turn this on.",
  unsupported: "This browser can't receive notifications.",
  denied:
    "Notifications are blocked for this site. Allow them in your browser or phone settings, then reopen this screen.",
};

/**
 * The daily-reminders switch in Profile → Preferences. Per device: turning it
 * on here subscribes only this browser.
 */
export function ReminderSettings() {
  const { state, busy, enable, disable, sendTest } = usePushReminders();

  return (
    <div className="space-y-3 border-t pt-4">
      <div className="space-y-1.5">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <BellRing className="h-4 w-4" />
          Daily reminders
        </p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          A nudge at 10 am and 8 pm (Nepal time) when today&apos;s expenses or
          planner goals are still open — nothing if you&apos;re already done —
          and a catch-up note after 3 days away. Set per device.
        </p>
      </div>

      {state === "on" || state === "off" ? (
        <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border p-3">
          <span className="text-sm">
            Remind me on this device
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {busy ? "Saving…" : state === "on" ? "On" : "Off"}
            </span>
          </span>
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <input
              type="checkbox"
              className="h-4 w-4 accent-[hsl(var(--brand))]"
              checked={state === "on"}
              onChange={(e) => (e.target.checked ? enable() : disable())}
            />
          )}
        </label>
      ) : (
        <p className="rounded-md bg-secondary px-3 py-2 text-xs text-muted-foreground">
          {NOTICES[state]}
        </p>
      )}

      {state === "on" && (
        <Button
          variant="outline"
          size="sm"
          className="w-full sm:w-auto"
          onClick={sendTest}
          disabled={busy}
        >
          Send a test notification
        </Button>
      )}
    </div>
  );
}
