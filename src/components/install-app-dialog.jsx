"use client";

import * as React from "react";
import { Check, Menu, Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  INSTALL_METHOD,
  INSTALL_STEPS,
  detectPlatform,
  installMethodFor,
  isRunningInstalled,
} from "@/lib/pwa-platform";

/**
 * The iOS Share glyph.
 *
 * Drawn rather than substituted with a generic share icon, because the whole
 * instruction is "tap *this* button" — a square with an upward arrow is what
 * the user is hunting for in Safari's toolbar, and Lucide's share icon (three
 * connected dots) looks nothing like it.
 */
function IosShareIcon({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 3v12" />
      <path d="m8 7 4-4 4 4" />
      <path d="M7 11H5.5A1.5 1.5 0 0 0 4 12.5v7A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5v-7A1.5 1.5 0 0 0 18.5 11H17" />
    </svg>
  );
}

/** Maps a step's icon name to a component. */
const STEP_ICONS = {
  share: IosShareIcon,
  plus: Plus,
  check: Check,
  menu: Menu,
};

/**
 * Platform-aware install instructions.
 *
 * The dialog exists because there is no universal install API. Chromium hands
 * us a real prompt; **iOS never does** — Safari's only path is Share → Add to
 * Home Screen, done by hand. So an install button either explains the right
 * manual steps for the device in front of the user, or it does nothing at all
 * on roughly half of phones.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {(open: boolean) => void} props.onOpenChange
 * @param {BeforeInstallPromptEvent|null} props.deferredPrompt
 * @param {() => Promise<void>} props.onNativeInstall
 */
export function InstallAppDialog({
  open,
  onOpenChange,
  deferredPrompt,
  onNativeInstall,
}) {
  const [busy, setBusy] = React.useState(false);

  /**
   * Resolved on the client only. Reading `navigator` during render would
   * produce different markup on the server and trip hydration, and the
   * platform cannot be known server-side anyway — a user agent string is a
   * hint, and `maxTouchPoints` is not in one at all.
   */
  const [method, setMethod] = React.useState(null);

  React.useEffect(() => {
    if (!open) return;
    const platform = detectPlatform(navigator.userAgent, {
      maxTouchPoints: navigator.maxTouchPoints ?? 0,
    });
    setMethod(installMethodFor(platform, Boolean(deferredPrompt)));
  }, [open, deferredPrompt]);

  async function handleNative() {
    setBusy(true);
    try {
      await onNativeInstall?.();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  const content = method ? INSTALL_STEPS[method] : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {method === null ? (
          // Momentary: the effect above runs on the first client tick.
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : method === INSTALL_METHOD.NATIVE ? (
          <>
            <DialogHeader>
              <DialogTitle>Install selfView</DialogTitle>
              <DialogDescription>
                It opens in its own window, works offline, and keeps you signed
                in — no app store, nothing to update.
              </DialogDescription>
            </DialogHeader>
            <Button onClick={handleNative} disabled={busy} className="w-full">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Install now
            </Button>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{content.title}</DialogTitle>
              <DialogDescription>{content.note}</DialogDescription>
            </DialogHeader>

            {content.steps.length > 0 && (
              <ol className="space-y-1">
                {content.steps.map((step, i) => {
                  const Icon = STEP_ICONS[step.icon] ?? Plus;
                  return (
                    <li
                      key={i}
                      className="flex items-start gap-3 rounded-lg px-1 py-2.5"
                    >
                      {/* The number carries the sequence; the icon shows what
                          to look for on screen. */}
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">
                        {i + 1}
                      </span>
                      <span className="flex-1 pt-0.5 text-sm leading-relaxed">
                        {step.text}
                      </span>
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    </li>
                  );
                })}
              </ol>
            )}

            <p className="rounded-lg bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
              Once it&apos;s on your home screen, open it and sign in as normal
              — you&apos;ll stay signed in after that.
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Everything an install control needs: whether to show at all, whether a
 * native prompt is available, and how to fire it.
 *
 * A hook so the landing page, the sidebar and the bottom nav share one
 * source of truth rather than each re-implementing the event plumbing.
 */
export function useInstallState() {
  const [deferredPrompt, setDeferredPrompt] = React.useState(null);
  const [installed, setInstalled] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [canInstall, setCanInstall] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);

    if (isRunningInstalled(window)) {
      setInstalled(true);
      return undefined;
    }

    const platform = detectPlatform(navigator.userAgent, {
      maxTouchPoints: navigator.maxTouchPoints ?? 0,
    });
    setCanInstall(platform.canEverInstall);

    const onBeforeInstall = (event) => {
      // Chromium shows its own mini-infobar otherwise; preventing it lets the
      // prompt fire from our button instead, where it has context.
      event.preventDefault();
      setDeferredPrompt(event);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    /**
     * Also react to being launched as an installed app mid-session, which
     * happens when the user installs and the browser hands the tab over.
     */
    const standaloneQuery = window.matchMedia("(display-mode: standalone)");
    const onDisplayChange = (e) => {
      if (e.matches) setInstalled(true);
    };
    standaloneQuery.addEventListener?.("change", onDisplayChange);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      standaloneQuery.removeEventListener?.("change", onDisplayChange);
    };
  }, []);

  const promptInstall = React.useCallback(async () => {
    if (!deferredPrompt) return "unavailable";
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    // The event is single-use — Chromium will not let it be prompted twice.
    setDeferredPrompt(null);
    if (outcome === "accepted") setInstalled(true);
    return outcome;
  }, [deferredPrompt]);

  return {
    /** False until the client has mounted, to avoid hydration mismatch. */
    mounted,
    installed,
    canInstall,
    deferredPrompt,
    promptInstall,
    /** Whether an install control is worth rendering at all. */
    shouldOffer: mounted && !installed && canInstall,
  };
}
