"use client";

import * as React from "react";
import { BellRing, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePushReminders } from "../use-push-reminders";

/** `pos-` prefixed, so signing out clears it along with other per-device state. */
const DISMISSED_KEY = "pos-reminder-prompt-dismissed-at";
const ASK_AGAIN_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
/** Let the screen settle first — a card over a half-painted page reads as an interruption. */
const SHOW_AFTER_MS = 2500;

function recentlyDismissed() {
  try {
    const at = Number(localStorage.getItem(DISMISSED_KEY));
    return Boolean(at) && Date.now() - at < ASK_AGAIN_AFTER_MS;
  } catch {
    return false;
  }
}

/**
 * Offers daily reminders when the app opens and they're off on this device.
 *
 * A card with a button, not the browser's permission popup straight away:
 * browsers only allow that popup from a tap (iOS ignores it otherwise), and
 * Chrome quietly blocks sites that fire it on load. The tap on "Turn on" is
 * what opens the real prompt.
 *
 * Never shown when reminders are on, blocked, unsupported, or on an iPhone
 * that hasn't installed the app. "Not now" hides it for a week.
 */
export function ReminderPrompt() {
  const { state, busy, enable } = usePushReminders();
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    if (state !== "off" || recentlyDismissed()) {
      setVisible(false);
      return undefined;
    }
    const timer = setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [state]);

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      // Storage blocked — it simply asks again next time.
    }
    setVisible(false);
  }

  async function turnOn() {
    const next = await enable();
    // Closed the browser's popup without choosing: treat it as "not now".
    if (next === "off" || next === "error") dismiss();
  }

  if (!visible || state !== "off") return null;

  return (
    <div
      role="dialog"
      aria-label="Turn on daily reminders"
      className="fixed inset-x-3 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-40 rounded-2xl border bg-card p-4 elev-lg animate-slide-up md:inset-x-auto md:bottom-6 md:right-6 md:w-[360px]"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <BellRing className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Get a daily nudge?</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            A reminder at 10 am and 8 pm — only when today&apos;s expenses or
            goals are still open. You can change it anytime in Profile.
          </p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={turnOn} disabled={busy}>
              {busy ? "Turning on…" : "Turn on"}
            </Button>
            <Button size="sm" variant="ghost" onClick={dismiss} disabled={busy}>
              Not now
            </Button>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close"
          className="-mr-1 -mt-1 rounded-full p-1.5 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
