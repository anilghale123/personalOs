"use client";

import * as React from "react";
import { toast } from "sonner";
import { BellRing, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const JSON_HEADERS = { "Content-Type": "application/json" };

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

function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function isIos() {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    // iPadOS reports itself as a Mac.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    navigator.standalone === true
  );
}

/** The worker is normally registered by PwaRegister; register it if not yet. */
async function workerRegistration() {
  if (!(await navigator.serviceWorker.getRegistration())) {
    await navigator.serviceWorker.register("/sw.js");
  }
  return navigator.serviceWorker.ready;
}

async function saveSubscription(subscription) {
  const res = await fetch("/api/push/subscription", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(subscription.toJSON()),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Could not turn reminders on.");
  }
}

/**
 * The daily-reminders switch in Profile → Preferences. Per device: turning it
 * on here subscribes only this browser.
 */
export function ReminderSettings() {
  const [state, setState] = React.useState("loading");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      let next;
      const supported =
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window;
      if (!PUBLIC_KEY) next = "unconfigured";
      else if (isIos() && !isStandalone()) next = "ios-install";
      else if (!supported) next = "unsupported";
      else if (Notification.permission === "denied") next = "denied";
      else {
        next = "off";
        try {
          const registration = await navigator.serviceWorker.getRegistration();
          const subscription = await registration?.pushManager.getSubscription();
          if (subscription && Notification.permission === "granted") {
            // Re-sent on every open: the server drops subscriptions that
            // bounce, and this is how one comes back.
            await saveSubscription(subscription);
            next = "on";
          }
        } catch {
          // Leave it showing "off"; turning it on will surface any error.
        }
      }
      if (!cancelled) setState(next);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    setBusy(true);
    try {
      // Must run straight from the tap — iOS refuses a prompt that isn't.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const registration = await workerRegistration();
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY),
        }));
      await saveSubscription(subscription);
      setState("on");
      toast.success("Reminders are on for this device.");
    } catch (err) {
      toast.error(err.message || "Could not turn reminders on.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/push/subscription", {
          method: "DELETE",
          headers: JSON_HEADERS,
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setState("off");
      toast.success("Reminders are off for this device.");
    } catch {
      toast.error("Could not turn reminders off — please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not send a test.");
      toast.success("Sent — it should appear in a few seconds.");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

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
