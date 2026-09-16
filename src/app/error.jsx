"use client";

import { ErrorScreen } from "@/components/error-screen";

/**
 * Catches anything thrown outside the app shell — the landing page, sign-in,
 * the privacy page — where there is no nav to fall back to, so this takes
 * the full viewport.
 */
export default function RootError({ error, reset }) {
  return (
    <ErrorScreen
      error={error}
      reset={reset}
      title="Something went wrong"
      fullPage
    />
  );
}
