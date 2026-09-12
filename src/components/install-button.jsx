"use client";

import * as React from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  InstallAppDialog,
  useInstallState,
} from "@/components/install-app-dialog";

/**
 * "Install app" button.
 *
 * Renders nothing once the app is already installed, and nothing at all in a
 * browser that cannot install web apps (desktop Firefox) — an offer that
 * cannot be fulfilled is worse than no offer.
 *
 * Clicking always opens {@link InstallAppDialog}, even when a native prompt is
 * available. The dialog says what installing does before the browser's own
 * modal appears, which is the difference between an accepted prompt and a
 * dismissed one.
 *
 * @param {{className?: string, size?: string, variant?: string, label?: string}} props
 */
export function InstallButton({
  className,
  size = "sm",
  variant = "outline",
  label = "Install app",
}) {
  const { shouldOffer, deferredPrompt, promptInstall } = useInstallState();
  const [open, setOpen] = React.useState(false);

  if (!shouldOffer) return null;

  async function handleNativeInstall() {
    const outcome = await promptInstall();
    if (outcome === "accepted") toast.success("selfView installed.");
  }

  return (
    <>
      <Button
        size={size}
        variant={variant}
        onClick={() => setOpen(true)}
        className={cn("gap-1.5", className)}
      >
        <Download className="h-4 w-4" />
        {label}
      </Button>

      <InstallAppDialog
        open={open}
        onOpenChange={setOpen}
        deferredPrompt={deferredPrompt}
        onNativeInstall={handleNativeInstall}
      />
    </>
  );
}
