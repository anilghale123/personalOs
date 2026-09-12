"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bell,
  Download,
  Monitor,
  Smartphone,
  WifiOff,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  InstallAppDialog,
  useInstallState,
} from "@/components/install-app-dialog";
import { detectPlatform } from "@/lib/pwa-platform";

/**
 * The Apple logo.
 *
 * Drawn rather than using Lucide's `Apple`, which is a piece of **fruit** —
 * complete with a leaf — and reads as a snack sitting next to the words
 * "iPhone & iPad".
 */
function AppleIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M16.36 12.58c-.02-2.2 1.8-3.26 1.88-3.31-1.02-1.5-2.61-1.7-3.18-1.72-1.35-.14-2.64.79-3.33.79-.69 0-1.75-.77-2.87-.75-1.48.02-2.84.86-3.6 2.18-1.53 2.66-.39 6.6 1.1 8.76.73 1.06 1.6 2.25 2.74 2.2 1.1-.04 1.51-.71 2.84-.71 1.32 0 1.7.71 2.86.69 1.18-.02 1.93-1.08 2.65-2.14.84-1.23 1.18-2.42 1.2-2.48-.03-.01-2.29-.88-2.31-3.5ZM14.2 5.88c.6-.74 1.01-1.76.9-2.78-.87.04-1.93.58-2.56 1.31-.56.65-1.06 1.69-.93 2.69.97.08 1.97-.49 2.59-1.22Z" />
    </svg>
  );
}

/** The Android robot mark, since Lucide has no Android glyph. */
function AndroidIcon({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M6 10.5a1 1 0 0 1 1 1v5a1 1 0 0 1-2 0v-5a1 1 0 0 1 1-1Zm12 0a1 1 0 0 1 1 1v5a1 1 0 0 1-2 0v-5a1 1 0 0 1 1-1ZM8 9h8a1 1 0 0 1 1 1v7a2 2 0 0 1-2 2h-.5v1.5a1 1 0 0 1-2 0V19h-1v1.5a1 1 0 0 1-2 0V19H9a2 2 0 0 1-2-2v-7a1 1 0 0 1 1-1Zm1.2-5.6a.5.5 0 0 1 .67-.22l1.06.53a3.6 3.6 0 0 1 2.14 0l1.06-.53a.5.5 0 1 1 .45.9l-.77.38A3.99 3.99 0 0 1 16 8H8a3.99 3.99 0 0 1 2.19-3.54l-.77-.39a.5.5 0 0 1-.22-.67ZM10 6.2a.6.6 0 1 0 0-1.2.6.6 0 0 0 0 1.2Zm4 0a.6.6 0 1 0 0-1.2.6.6 0 0 0 0 1.2Z" />
    </svg>
  );
}

/** What installing actually buys you. Concrete, not a feature list. */
const BENEFITS = [
  {
    icon: Zap,
    title: "Opens like an app",
    body: "Its own icon and window. No tabs, no address bar, no hunting for it.",
  },
  {
    icon: WifiOff,
    title: "Works without signal",
    body: "Write and read on a plane or in a tunnel; it syncs when you're back.",
  },
  {
    icon: Bell,
    title: "Stays signed in",
    body: "Sign in once after installing. It remembers you from then on.",
  },
];

/**
 * The install section on the landing page.
 *
 * Placed before the sign-up call to action deliberately: someone who installs
 * first then signs up inside the installed app ends up with the app on their
 * home screen *and* an account, which is the outcome worth having. Someone who
 * signs up in a browser tab usually never installs at all.
 *
 * The button is honest about platform. It renders nothing where install is
 * impossible (desktop Firefox) or already done, and on iOS it opens
 * instructions rather than calling a prompt iOS does not have.
 */
export function LandingInstall({ signedIn }) {
  const { mounted, installed, shouldOffer, deferredPrompt, promptInstall } =
    useInstallState();
  const [open, setOpen] = React.useState(false);
  const [platform, setPlatform] = React.useState(null);

  React.useEffect(() => {
    setPlatform(
      detectPlatform(navigator.userAgent, {
        maxTouchPoints: navigator.maxTouchPoints ?? 0,
      })
    );
  }, []);

  /**
   * Name the platform in the button when we know it. "Add to iPhone" tells an
   * iOS visitor this applies to them; a generic "Install app" reads as an
   * Android-or-desktop thing that Apple users routinely skip past.
   */
  const buttonLabel = React.useMemo(() => {
    if (!platform) return "Install the app";
    if (platform.isIOS) return "Add to your iPhone";
    if (platform.isAndroid) return "Install on Android";
    return "Install the app";
  }, [platform]);

  return (
    <section
      id="install"
      className="mx-auto w-full max-w-6xl px-5 pt-24 sm:px-8 sm:pt-32"
    >
      <div className="overflow-hidden rounded-3xl border border-border/60 bg-card">
        <div className="grid items-center gap-10 p-8 sm:p-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
          <div>
            <p className="kicker mb-4 flex items-center gap-2 text-[13px] text-clay-700">
              <Smartphone className="h-3.5 w-3.5" />
              Free · no app store
            </p>

            <h2 className="text-balance font-display text-3xl tracking-tight sm:text-4xl">
              Keep it on your home screen.
            </h2>

            <p className="mt-4 max-w-[46ch] leading-relaxed text-muted-foreground">
              selfView installs straight from this page — on iPhone, iPad,
              Android, and desktop. It takes about ten seconds and nothing is
              downloaded from a store.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              {/* Until mounted we cannot know the platform or install state,
                  so render nothing rather than a button that might be wrong. */}
              {mounted && shouldOffer && (
                <Button
                  size="lg"
                  onClick={() => setOpen(true)}
                  className="h-12 w-full text-base sm:w-auto"
                >
                  <Download className="h-4 w-4" />
                  {buttonLabel}
                </Button>
              )}

              {mounted && installed && (
                <p className="text-sm font-medium text-muted-foreground">
                  selfView is installed on this device.
                </p>
              )}

              {/* Sign-up stays available alongside: installing first is the
                  better order, but it must never be a gate. */}
              <Button
                asChild
                variant={shouldOffer ? "outline" : "default"}
                size="lg"
                className="h-12 w-full text-base sm:w-auto"
              >
                <Link href={signedIn ? "/app" : "/signup"}>
                  {signedIn ? "Open selfView" : "Create your account"}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>

            <p className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <AppleIcon className="h-3.5 w-3.5" />
                iPhone &amp; iPad
              </span>
              <span className="flex items-center gap-1.5">
                <AndroidIcon className="h-3.5 w-3.5" />
                Android
              </span>
              <span className="flex items-center gap-1.5">
                <Monitor className="h-3.5 w-3.5" />
                Mac &amp; Windows
              </span>
            </p>
          </div>

          <ul className="space-y-1">
            {BENEFITS.map((benefit) => {
              const Icon = benefit.icon;
              return (
                <li
                  key={benefit.title}
                  className="flex gap-4 rounded-2xl p-4 transition-colors hover:bg-muted/40"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sage-200 text-foreground">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium leading-snug">{benefit.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {benefit.body}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <InstallAppDialog
        open={open}
        onOpenChange={setOpen}
        deferredPrompt={deferredPrompt}
        onNativeInstall={promptInstall}
      />
    </section>
  );
}
