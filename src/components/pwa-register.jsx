"use client";

import { useEffect } from "react";

/**
 * Registers the service worker so the app is installable as a PWA.
 * Renders nothing.
 *
 * Not in development: `next dev` chunk URLs aren't content-hashed, so a
 * worker that caches them serves stale component code against fresh
 * server HTML (hydration mismatches after every edit). In dev this instead
 * removes any worker and caches left from an earlier session.
 */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => Promise.all(registrations.map((r) => r.unregister())))
        .catch(() => {});
      if ("caches" in window) {
        caches
          .keys()
          .then((keys) => Promise.all(keys.filter((k) => k.startsWith("selfview-")).map((k) => caches.delete(k))))
          .catch(() => {});
      }
      return;
    }

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js")
        .catch((err) => console.warn("SW registration failed:", err));
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
