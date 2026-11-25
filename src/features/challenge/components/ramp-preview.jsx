"use client";

import * as React from "react";
import { targetFor } from "@/features/challenge/utils";

/**
 * A one-line sanity check on a ramp: the target on the first, a middle, and
 * the last day. Shown under each tracker in the builder so a goal of "100 by
 * day 88" reads as "Day 1: 20 → Day 44: 60 → Day 88: 100" before it is saved.
 *
 * Pure — it only reads the challenge and tracker it is given, so the builder
 * can re-render it on every keystroke without touching the server.
 */
export function RampPreview({ challenge, tracker, className }) {
  if (!tracker || !challenge) return null;

  const N = challenge.totalDays;
  const day1 = targetFor(challenge, tracker, 1);
  const midDay = Math.max(1, Math.ceil(N / 2));
  const mid = targetFor(challenge, tracker, midDay);
  const last = targetFor(challenge, tracker, N);

  // Nothing to preview: uncalibrated or goal-less, or a check habit (which
  // is always "1"), so a preview would just say "1 → 1 → 1".
  if (tracker.metric === "check") {
    return (
      <p className={className || "text-xs text-muted-foreground"}>
        A yes-or-no habit — hit it every day.
      </p>
    );
  }
  if (day1 == null && last == null) {
    return (
      <p className={className || "text-xs text-muted-foreground"}>
        Set a goal (and a starting level) to preview the ramp.
      </p>
    );
  }

  const show = (v) => (v == null ? "—" : v);
  return (
    <p className={className || "text-xs text-muted-foreground tabular-nums"}>
      Day 1: {show(day1)}
      {N > 2 && <> · Day {midDay}: {show(mid)}</>}
      {" · "}Day {N}: {show(last)}
    </p>
  );
}
