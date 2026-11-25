"use client";

import * as React from "react";
import Link from "next/link";
import { Plus, Trophy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { useAppUser } from "@/components/app-user";
import { asList, readSnapshot, sameData, writeSnapshot } from "@/lib/snapshot";
import {
  markRead,
  shouldRead,
} from "@/lib/screen-data";
import { ChallengeCard } from "@/features/challenge/components/challenge-card";

/**
 * The challenges list.
 *
 * Paints the saved copy (so returning to the screen is instant) and re-reads
 * /api/challenges behind it, following the same cache-first rule as the
 * planner. Writes elsewhere call invalidateScreens("challenges") to bring a
 * stale list back.
 */
export function ChallengeList() {
  const userId = useAppUser()?.id;
  const [challenges, setChallenges] = React.useState(null);
  const challengesRef = React.useRef(null);
  challengesRef.current = challenges;

  const load = React.useCallback(
    async ({ force = false } = {}) => {
      if (!force && !shouldRead(userId, "challenges", challengesRef.current !== null)) {
        return;
      }
      try {
        const res = await fetch("/api/challenges");
        if (!res.ok) throw new Error();
        const data = await res.json();
        setChallenges((cur) => (sameData(cur, data) ? cur : asList(data)));
        writeSnapshot(userId, "challenges", data);
        markRead(userId, "challenges");
      } catch {
        if (challengesRef.current === null) {
          toast.error("Could not load your challenges.");
        }
      }
    },
    [userId]
  );

  React.useEffect(() => {
    if (!userId) return;
    const saved = readSnapshot(userId, "challenges");
    if (Array.isArray(saved)) setChallenges(saved);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return (
    <div className="space-y-4">
      {challenges === null ? (
        <div className="space-y-3" aria-busy="true">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-2xl bg-card elev-sm p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-11 w-11 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-2 w-full" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : challenges.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="No challenges yet"
          description="A challenge is a fixed-length run — 30, 75, 88 days — where your habits ramp up automatically toward a goal."
        >
          <Link href="/app/challenges/new">
            <Button>
              <Plus className="h-4 w-4" />
              Start a challenge
            </Button>
          </Link>
        </EmptyState>
      ) : (
        <div className="space-y-2.5">
          {challenges.map((c) => (
            <ChallengeCard key={c._id} challenge={c} />
          ))}
        </div>
      )}
    </div>
  );
}

