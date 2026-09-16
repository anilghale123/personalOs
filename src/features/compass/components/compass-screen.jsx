"use client";

import * as React from "react";
import { toast } from "sonner";
import { useAppUser } from "@/components/app-user";
import { useClientClock } from "@/lib/client-clock";
import { useScreenData } from "@/lib/screen-data";
import { asList, asRecord } from "@/lib/snapshot";
import { weekLabel } from "@/lib/week";
import { CompassClient } from "./compass-client";
import { WeeklyGoals } from "./weekly-goals";

/**
 * Goals & Habits.
 *
 * The screen is never withheld: the week heading, the habit card, the
 * heatmap frame and the add buttons are drawn on the first frame, and only
 * the lists inside them wait. `useScreenData` hands over what this device
 * already has *during* render, so after the first open nothing is waiting
 * and no placeholder is shown at all.
 */
export function CompassScreen() {
  const userId = useAppUser()?.id;
  const { data, failed } = useScreenData(
    userId,
    "compass",
    "/api/compass/screen"
  );

  // The heading names a real week, so it comes from the viewer's clock:
  // this route is prerendered, and a label worked out during render would
  // name the week of the deploy.
  const [label] = useClientClock(() => weekLabel());

  // Only the very first open on a device, and only until it answers once.
  const pending = data === null && !failed;

  React.useEffect(() => {
    if (failed && data === null) toast.error("Couldn't load your goals.");
  }, [failed, data]);

  // Never trusted — see lib/snapshot.js.
  return (
    <div className="space-y-8">
      <WeeklyGoals
        initialGoals={asList(data?.weeklyGoals)}
        weekLabel={label ?? ""}
        pending={pending}
      />
      <CompassClient
        initialGoals={asList(data?.goals)}
        initialHeatmap={asRecord(data?.heatmap)}
        initialHabits={asList(data?.habits)}
        pending={pending}
      />
    </div>
  );
}
