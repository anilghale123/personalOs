"use client";

import * as React from "react";
import Link from "next/link";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Export, in Profile → Privacy.
 *
 * There is deliberately no delete button beside it. Deletion is handled by
 * asking — see the privacy page, which says so — so that the one action in
 * the app that cannot be undone is not a tap away from a switch. Export
 * stands on its own: it is what makes the privacy page checkable rather than
 * merely reassuring, since anyone can see exactly what is held about them.
 */
export function AccountData() {
  const [exporting, setExporting] = React.useState(false);

  async function download() {
    setExporting(true);
    try {
      const res = await fetch("/api/account/export");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not prepare your export.");
      }
      /**
       * Read it as a blob and save it from here rather than pointing the
       * browser at the URL: a plain link would open a new tab that needs the
       * session cookie again, and on iOS renders the JSON instead of saving
       * it.
       */
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `selfview-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success("Your data has been downloaded.");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-2 border-t pt-4">
      <p className="text-sm font-medium">Your data</p>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Download everything the app holds about you as a single JSON file —
        every expense, entry, goal and trade, not a summary.{" "}
        <Link
          href="/privacy"
          className="underline underline-offset-2 hover:text-foreground"
        >
          What we store, and who can reach it
        </Link>
        .
      </p>
      <Button
        variant="outline"
        size="sm"
        onClick={download}
        disabled={exporting}
        className="w-full sm:w-auto"
      >
        {exporting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        {exporting ? "Preparing…" : "Download my data"}
      </Button>
    </div>
  );
}
