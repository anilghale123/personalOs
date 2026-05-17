"use client";

import * as React from "react";
import { StickyNote } from "lucide-react";
import { useJournalStore } from "@/features/journal/store";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { CalendarSidebar } from "@/features/journal/components/calendar-sidebar";
import { DailyAnchorCard } from "@/features/journal/components/daily-anchor-card";
import {
  QuickNoteInput,
  QuickNoteHint,
} from "@/features/journal/components/quick-note-input";
import { QuickNoteCard } from "@/features/journal/components/quick-note-card";

export function JournalScreen({ initialData }) {
  const hydrate = useJournalStore((s) => s.hydrate);
  const flushSave = useJournalStore((s) => s.flushSave);
  const notes = useJournalStore((s) => s.notes);
  const loadingDay = useJournalStore((s) => s.loadingDay);

  // Seed the store from server-rendered data, once.
  React.useEffect(() => {
    hydrate(initialData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Never lose an in-flight edit when the tab is hidden or closed.
  React.useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flushSave();
    };
    window.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", flushSave);
    return () => {
      window.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", flushSave);
      flushSave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pinned notes float to the top; the rest stay chronological.
  const orderedNotes = React.useMemo(() => {
    return [...notes].sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return (
        new Date(a.createdAt || 0) - new Date(b.createdAt || 0)
      );
    });
  }, [notes]);

  return (
    <div className="grid gap-6 lg:grid-cols-[248px_1fr]">
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <CalendarSidebar />
      </aside>

      <div className="space-y-6">
        {/* Section 1 — Daily Anchor Journal */}
        <DailyAnchorCard />

        {/* Section 2 — Quick Sticky Notes */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <StickyNote className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">Quick Notes</h2>
            {notes.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {notes.length}
              </span>
            )}
          </div>

          <div>
            <QuickNoteInput />
            <QuickNoteHint />
          </div>

          {loadingDay ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : orderedNotes.length === 0 ? (
            <EmptyState
              icon={StickyNote}
              title="No quick notes yet"
              description="Jot down a passing thought above — it saves the moment you hit Enter."
            />
          ) : (
            <div className="space-y-2">
              {orderedNotes.map((note) => (
                <QuickNoteCard key={note._id} note={note} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
