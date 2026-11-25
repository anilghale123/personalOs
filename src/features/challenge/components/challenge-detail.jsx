"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/empty-state";
import { invalidateScreens } from "@/lib/screen-data";
import { DayLogger } from "./day-logger";
import { ChallengeDashboard } from "./challenge-dashboard";
import { ChallengeBuilder } from "./challenge-builder";

/**
 * The challenge page: header with day + status, and three tabs.
 *
 *   Today     — log the day (day-logger)
 *   Progress  — KPIs, pace, charts (challenge-dashboard)
 *   Setup     — the builder in edit mode (challenge-builder)
 *
 * It owns the two reads both tabs need (the challenge and its stats) and a
 * refresh key: any write bumps it, and whichever tab is showing re-reads.
 * The challenge itself is re-read too, because logging day 1 calibrates
 * baselines and editing changes the tree.
 */
export function ChallengeDetail({ id }) {
  const [challenge, setChallenge] = React.useState(null);
  const [stats, setStats] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [tab, setTab] = React.useState("today");
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [deleting, setDeleting] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState(false);

  const refresh = React.useCallback(() => setRefreshKey((n) => n + 1), []);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [cRes, sRes] = await Promise.all([
          fetch(`/api/challenges/${id}`),
          fetch(`/api/challenges/${id}/stats`),
        ]);
        if (!cRes.ok) throw new Error();
        const c = await cRes.json();
        const s = sRes.ok ? await sRes.json() : null;
        if (cancelled) return;
        setChallenge(c);
        setStats(s);
      } catch {
        if (!cancelled) toast.error("Could not load that challenge.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id, refreshKey]);

  async function removeChallenge() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/challenges/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      invalidateScreens("challenges");
      toast.success("Challenge deleted.");
      // Let the parent list repaint; the router goes back to it.
      window.history.back();
    } catch {
      toast.error("Could not delete the challenge.");
      setDeleting(false);
    }
  }

  if (loading && !challenge) {
    return (
      <div className="space-y-4" aria-busy="true">
        <SkeletonLine />
      </div>
    );
  }

  if (!challenge) {
    return (
      <EmptyState
        title="Challenge not found"
        description="It may have been deleted."
      >
        <Link href="/app/challenges">
          <Button variant="outline">Back to challenges</Button>
        </Link>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/app/challenges"
            className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Challenges
          </Link>
          <h1 className="font-display text-[24px] leading-tight tracking-tight sm:text-[30px]">
            {challenge.title}
          </h1>
          {challenge.description && (
            <p className="mt-1 text-sm text-muted-foreground">
              {challenge.description}
            </p>
          )}
          <p className="mt-1 text-sm text-muted-foreground">
            Day {challenge.dayNumber} of {challenge.totalDays}
            {challenge.status !== "active" && (
              <span className="ml-2 capitalize">· {challenge.status}</span>
            )}
          </p>
        </div>

        <div className="flex shrink-0 gap-1">
          <Button
            variant="outline"
            size="icon"
            aria-label="Edit setup"
            onClick={() => setTab("setup")}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Delete"
            onClick={() => setPendingDelete(true)}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="today">Today</TabsTrigger>
          <TabsTrigger value="progress">Progress</TabsTrigger>
          <TabsTrigger value="setup">Setup</TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="mt-0">
          <DayLogger
            challenge={challenge}
            refreshKey={refreshKey}
            onChanged={refresh}
          />
        </TabsContent>

        <TabsContent value="progress" className="mt-0">
          <ChallengeDashboard challenge={challenge} stats={stats} />
        </TabsContent>

        <TabsContent value="setup" className="mt-0">
          <ChallengeBuilder existing={challenge} />
        </TabsContent>
      </Tabs>

      <Dialog
        open={pendingDelete}
        onOpenChange={setPendingDelete}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this challenge?</DialogTitle>
            <DialogDescription>
              &ldquo;{challenge.title}&rdquo; and every day you logged will be
              removed. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPendingDelete(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={removeChallenge}>
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SkeletonLine() {
  return (
    <div className="rounded-2xl bg-card elev-sm p-5">
      <div className="h-6 w-48 rounded bg-muted" />
      <div className="mt-3 space-y-2">
        <div className="h-3 w-32 rounded bg-muted" />
        <div className="h-3 w-24 rounded bg-muted" />
      </div>
    </div>
  );
}
