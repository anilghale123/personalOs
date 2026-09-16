"use client";

import { ErrorScreen } from "@/components/error-screen";

/**
 * The last resort: an error thrown by the root layout itself, which is the
 * one case `app/error.jsx` cannot catch because the layout that would render
 * it is the thing that failed.
 *
 * It therefore has to supply its own `<html>` and `<body>` — React has
 * nothing else to mount into here. That also means the fonts and the theme
 * class set by the root layout are absent, so this renders with the
 * browser's defaults on purpose rather than half-styled.
 */
export default function GlobalError({ error, reset }) {
  return (
    <html lang="en">
      <body>
        <ErrorScreen
          error={error}
          reset={reset}
          title="Something went wrong"
          fullPage
        />
      </body>
    </html>
  );
}
