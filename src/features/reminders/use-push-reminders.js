"use client";

import * as React from "react";
import { toast } from "sonner";
import { reminderState } from "./device-state";

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

/* ------------------------------------------------------------------ *
 * One shared reading per page load.
 *
 * Both the Profile switch and the prompt shown on open use this hook, so
 * without a shared store each ran its own check and its own re-sync — two
 * writes per open, and two components that could disagree about what the
 * switch should say.
 * ------------------------------------------------------------------ */

let current = "loading";
let started = false;
const listeners = new Set();

function setShared(state) {
  if (state === current) return;
  current = state;
  listeners.forEach((notify) => notify());
}

/**
 * The service worker registration, waiting briefly for one to appear.
 *
 * PwaRegister registers on the window `load` event, which fires *after* this
 * hook's first effect. Asking `getRegistration()` at that moment can answer
 * "none" on a device that is in fact subscribed — one of the ways the switch
 * read "off" for someone who never turned it off. Waiting on `ready` closes
 * that gap; the timeout means a browser that will never have a worker (dev,
 * where PwaRegister unregisters instead) still answers rather than hanging.
 */
async function registrationSoon(timeoutMs = 5000) {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

/** The subscription this browser holds, or null. */
async function browserSubscription() {
  const registration = await registrationSoon();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

async function postSubscription(subscription) {
  const res = await fetch("/api/push/subscription", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(subscription.toJSON()),
  });
  if (res.ok) return;
  const data = await res.json().catch(() => ({}));
  const error = new Error(data.error || "Could not turn reminders on.");
  // A 400 will never get better by asking again; a 5xx or a rate limit might.
  error.retryable = res.status >= 500 || res.status === 429;
  throw error;
}

/**
 * Whether the person turned reminders on here and has not turned them off.
 *
 * The browser alone cannot answer that: a missing subscription looks the same
 * whether the user switched reminders off or the browser removed them on its
 * own. This is the missing half, so a subscription the browser dropped is
 * repaired instead of being reported as the user's choice.
 *
 * `pos-` prefixed, so signing out clears it — and signing out also
 * unsubscribes, which is exactly when a shared device should stop reminding
 * whoever used it last.
 */
const WANTED_KEY = "pos-reminders-wanted";

function readWanted() {
  try {
    return localStorage.getItem(WANTED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeWanted(wanted) {
  try {
    if (wanted) localStorage.setItem(WANTED_KEY, "1");
    else localStorage.removeItem(WANTED_KEY);
  } catch {
    // Storage blocked: the switch still works, it just cannot self-repair.
  }
}

/**
 * Put back a subscription the user still wants but the browser removed.
 *
 * Only attempted when notification permission is still granted, so no prompt
 * is ever shown without a tap. Chrome and Firefox allow this silently; Safari
 * may refuse without a tap, in which case the switch reports "interrupted"
 * and one tap on it does the same thing.
 *
 * @returns {Promise<PushSubscription|null>}
 */
async function heal() {
  try {
    const registration = await registrationSoon();
    if (!registration) return null;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY),
    });
    resync(subscription);
    return subscription;
  } catch {
    return null;
  }
}

/** Backoff between re-sync attempts. */
const RETRY_DELAYS_MS = [1000, 4000, 15000];

/**
 * Re-register this device with the server, in the background.
 *
 * The server drops a subscription that bounces, and this is how one comes
 * back — so it runs on every open. What it must **never** do is decide what
 * the switch shows. The previous version awaited this POST inside the state
 * check and left the state at "off" when it threw, so a single failed
 * request — a flaky connection, a cold serverless start, a rate-limited
 * burst, the app opening before the network was up — made reminders look
 * like they had switched themselves off overnight, while the browser stayed
 * subscribed the whole time. Retried, and silent either way.
 */
async function resync(subscription) {
  for (let attempt = 0; ; attempt++) {
    try {
      await postSubscription(subscription);
      return true;
    } catch (err) {
      // `retryable` is undefined for a network-level failure, which is
      // exactly the case most worth retrying.
      if (err.retryable === false || attempt >= RETRY_DELAYS_MS.length) {
        return false;
      }
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    }
  }
}

/**
 * What this device's reminder state actually is.
 *
 * Read only from what the browser knows for certain — the notification
 * permission, and whether a push subscription exists. Nothing on the network
 * can turn this answer into "off".
 */
async function probe() {
  const supported =
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;
  const device = {
    configured: Boolean(PUBLIC_KEY),
    ios: isIos(),
    standalone: isStandalone(),
    supported,
    permission: supported ? Notification.permission : "default",
    subscribed: false,
    wanted: readWanted(),
  };

  // Only worth asking once the cheaper answers have not already settled it.
  if (supported && device.permission === "granted") {
    let subscription = null;
    try {
      subscription = await browserSubscription();
    } catch {
      // No worker, or push blocked at the platform level: not subscribed.
    }

    if (subscription) {
      resync(subscription);
      // Devices that turned reminders on before intent was remembered have
      // no flag yet; a live subscription is proof enough that they want it.
      if (!device.wanted) writeWanted(true);
      device.wanted = true;
    } else if (device.wanted && PUBLIC_KEY) {
      subscription = await heal();
    }
    device.subscribed = Boolean(subscription);
  }

  return reminderState(device);
}

/**
 * Daily reminders for this device — shared by the Profile switch and the
 * prompt shown when the app opens, so both follow exactly the same rules.
 *
 * `state` is one of:
 *   loading | unconfigured | ios-install | unsupported | denied | off | on
 *   | interrupted — wanted here, but the browser removed the subscription
 *     and it could not be put back without a tap
 */
export function usePushReminders() {
  const state = React.useSyncExternalStore(
    React.useCallback((notify) => {
      listeners.add(notify);
      return () => listeners.delete(notify);
    }, []),
    () => current,
    () => "loading"
  );
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!started) {
      started = true;
      probe().then(setShared);
    }

    /**
     * A device that just came back online is both the one most likely to
     * have failed its re-sync and the one the server most needs to hear
     * from, so ask again the moment the connection returns.
     */
    function onOnline() {
      if (current === "on") {
        browserSubscription().then((s) => s && resync(s)).catch(() => {});
      }
    }
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
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
        setShared(next);
        return next;
      }
      // The worker is normally registered by PwaRegister; register it if not.
      if (!(await navigator.serviceWorker.getRegistration())) {
        await navigator.serviceWorker.register("/sw.js");
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY),
        }));
      // Turning it on is the one place the server's answer matters: if this
      // never lands, nothing will ever be sent to this device.
      await postSubscription(subscription);
      writeWanted(true);
      setShared("on");
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
      const subscription = await browserSubscription();
      if (subscription) {
        // Best effort: if this request fails the row is left behind, and the
        // first send to an unsubscribed endpoint clears it out anyway. What
        // has to happen is the line below — the browser itself stopping.
        await fetch("/api/push/subscription", {
          method: "DELETE",
          headers: JSON_HEADERS,
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        }).catch(() => {});
        await subscription.unsubscribe();
      }
      // The one place reminders are allowed to become "off".
      writeWanted(false);
      setShared("off");
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
