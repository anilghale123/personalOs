"use client";

import { ErrorScreen } from "@/components/error-screen";

/**
 * Catches anything thrown while rendering a screen inside the app shell.
 *
 * The sidebar, the bottom nav and the shell around this stay on screen and
 * keep working, so a screen that fails is a screen that failed — not the
 * whole app falling over. Tapping another tab is enough to carry on.
 *
 * There was no boundary here at all, which is why a render error showed
 * Next's raw "Application error: a client-side exception has occurred".
 */
export default function AppError({ error, reset }) {
  return <ErrorScreen error={error} reset={reset} />;
}
