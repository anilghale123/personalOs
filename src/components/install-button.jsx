"use client";

import * as React from "react";
import { Download, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/** True when the app is already running as an installed PWA. */
function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

/**
 * "Install app" button.
 * - Visible everywhere in the browser while the app is NOT installed.
 * - Hidden once the app runs as an installed PWA.
 * - Uses the native install prompt when the browser offers one;
 *   otherwise shows manual "Add to Home Screen" guidance (e.g. iOS).
 *
 * @param {{ className?: string, size?: string }} props
 */
export function InstallButton({ className, size = "sm" }) {
  const [deferred, setDeferred] = React.useState(null);
  const [installed, setInstalled] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    if (isStandalone()) {
      setInstalled(true);
      return;
    }
    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferred(e);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
      toast.success("Personal OS installed.");
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Avoid a hydration mismatch — decide visibility only on the client.
  if (!mounted || installed) return null;

  async function handleInstall() {
    if (deferred) {
      deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === "accepted") setInstalled(true);
      setDeferred(null);
      return;
    }
    // No native prompt (iOS Safari, or criteria not yet met).
    toast("Install Personal OS", {
      description:
        "Open your browser menu and choose “Install app” or “Add to Home Screen”.",
      icon: <Download className="h-4 w-4" />,
    });
  }

  return (
    <Button
      size={size}
      variant="outline"
      onClick={handleInstall}
      className={cn("gap-1.5", className)}
    >
      <Download className="h-4 w-4" />
      Install app
    </Button>
  );
}
