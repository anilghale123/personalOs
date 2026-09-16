"use client";

import * as React from "react";
import { RefreshCw, House } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * What a user sees instead of "Application error: a client-side exception
 * has occurred".
 *
 * That default screen is the worst thing this app can show: it is unbranded,
 * says nothing anyone can act on, and leaves no way forward but the back
 * button. It also implies the data is gone, which it never is — everything is
 * on the server and in this device's saved copies, and the render is the only
 * thing that failed.
 *
 * So this says what happened in one line, and gives two ways out: try the
 * same screen again, which is enough for anything transient, and go home,
 * which is enough for anything not.
 *
 * `digest` is Next's id for the matching server-side log entry. Shown small
 * and last, because it means nothing to the reader and everything to whoever
 * they send it to.
 */
export function ErrorScreen({
  error,
  reset,
  title = "That screen didn't load",
  fullPage = false,
}) {
  React.useEffect(() => {
    // Console rather than a logger: this runs in the browser, and the
    // server-side capture already happened where the error was thrown.
    console.error("Screen failed to render:", error);
  }, [error]);

  return (
    <div
      className={
        fullPage
          ? "flex min-h-dvh items-center justify-center bg-background px-5"
          : "flex min-h-[60vh] items-center justify-center px-2"
      }
    >
      <div className="w-full max-w-md text-center">
        <h1 className="font-display text-2xl tracking-tight">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Something went wrong drawing this page. Nothing you have saved is
          affected — it is all still here. Try again, and if it keeps
          happening, let us know.
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {reset && (
            <Button onClick={reset}>
              <RefreshCw className="h-4 w-4" />
              Try again
            </Button>
          )}
          <Button variant="outline" asChild>
            {/* A plain anchor, not a Link: whatever broke may have left the
                client router in a state that cannot navigate, and a full
                load always works. */}
            <a href="/app">
              <House className="h-4 w-4" />
              Go home
            </a>
          </Button>
        </div>

        {error?.digest && (
          <p className="mt-6 text-xs text-muted-foreground">
            Reference: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
