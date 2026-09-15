"use client";

import * as React from "react";
import { toast } from "sonner";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const JSON_HEADERS = { "Content-Type": "application/json" };

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
 * Daily reminders for this device — shared by the Profile switch and the
 * prompt shown when the app opens, so both follow exactly the same rules.
 *
 * `state` is one of:
 *   loading | unconfigured | ios-install | unsupported | denied | off | on
 */
export function usePushReminders() {
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
          // Leave it "off"; turning it on will surface any error.
        }
      }
      if (!cancelled) setState(next);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Ask for permission and subscribe. Must be called straight from a tap —
   * browsers (iOS above all) refuse a permission prompt that isn't.
   * @returns {Promise<string>} the resulting state
   */
  const enable = React.useCallback(async () => {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        const next = permission === "denied" ? "denied" : "off";
        setState(next);
        return next;
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
      return "on";
    } catch (err) {
      toast.error(err.message || "Could not turn reminders on.");
      return "error";
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = React.useCallback(async () => {
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
  }, []);

  const sendTest = React.useCallback(async () => {
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
  }, []);

  return { state, busy, enable, disable, sendTest };
}
