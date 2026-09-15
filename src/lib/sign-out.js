"use client";

import { signOut } from "next-auth/react";

/**
 * Sign out, and clear what the browser kept.
 *
 * `signOut()` alone drops the session cookie but leaves the service worker's
 * caches and any per-device UI state behind. On a shared device — a family
 * laptop, a borrowed phone — that is the gap between "signed out" and actually
 * gone. Private pages are never cached (see public/sw.js), but public ones can
 * still carry a name, and clearing is cheap.
 *
 * The cache wipe is best-effort and never blocks the sign-out itself: failing
 * to clear a cache must not trap someone in a signed-in state.
 *
 * @param {{callbackUrl?: string}} [options]
 */
export async function signOutEverywhere({ callbackUrl = "/login" } = {}) {
  /**
   * Stop this device's reminders — otherwise a shared phone keeps showing
   * "Anil, have you logged…" to whoever picks it up next. Must run while the
   * session still exists, since the delete route needs it.
   */
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    const subscription = await registration?.pushManager?.getSubscription();
    if (subscription) {
      await fetch("/api/push/subscription", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      }).catch(() => {});
      await subscription.unsubscribe();
    }
  } catch {
    // No worker or no push support — nothing to stop.
  }

  try {
    const registration = await navigator.serviceWorker?.ready;
    if (registration?.active) {
      registration.active.postMessage({ type: "CLEAR_CACHES" });
    }
  } catch {
    // No service worker, or it is not controlling this page yet.
  }

  try {
    // Per-device conveniences only (remembered tab, collapsed sections).
    // Deliberately not `localStorage.clear()` — the theme preference is not
    // account data and losing it flashes the wrong theme on the login screen.
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("pos-") && key !== "pos-theme") {
        localStorage.removeItem(key);
      }
    }
    sessionStorage.clear();
  } catch {
    // Private mode, or storage blocked.
  }

  await signOut({ callbackUrl });
}
