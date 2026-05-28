"use client";

import * as React from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Loader2,
  StickyNote,
} from "lucide-react";
import { formatDate, toDateKey } from "@/lib/utils";
import { useJournalStore } from "@/features/journal/store";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
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
  const selectDate = useJournalStore((s) => s.selectDate);
  const activeDate = useJournalStore((s) => s.activeDate);
  const notes = useJournalStore((s) => s.notes);
  const notesTotal = useJournalStore((s) => s.notesTotal);
  const notesHasMore = useJournalStore((s) => s.notesHasMore);
  const loadingDay = useJournalStore((s) => s.loadingDay);
  const loadingMoreNotes = useJournalStore((s) => s.loadingMoreNotes);
  const loadMoreNotes = useJournalStore((s) => s.loadMoreNotes);
  const saveStatus = useJournalStore((s) => s.saveStatus);

  const [calendarOpen, setCalendarOpen] = React.useState(false);

  React.useEffect(() => {
    hydrate(initialData);
    const localToday = toDateKey();
    if (localToday !== initialData.date) {
      selectDate(localToday);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flushSave();
    };
    const onOnline = () => {
      if (saveStatus !== "saved") flushSave();
    };
    window.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", flushSave);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", flushSave);
      window.removeEventListener("online", onOnline);
      flushSave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveStatus]);

  const orderedNotes = React.useMemo(() => {
    return [...notes].sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    });
  }, [notes]);

  const today = toDateKey();
  const dateLabel =
    activeDate === today ? "Today" : formatDate(activeDate);

  return (
    <div className="-mx-4 journal-page-bg px-4 sm:mx-0 sm:px-0">
      {/* Mobile: sticky calendar toggle + current date */}
      <div className="sticky top-0 z-20 -mx-4 mb-4 border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{dateLabel}</p>
            <p className="truncate text-xs text-muted-foreground">
              Tap calendar to browse dates
            </p>
          </div>
          <Button
            variant={calendarOpen ? "secondary" : "outline"}
            size="sm"
            className="shrink-0 gap-1.5"
            onClick={() => setCalendarOpen((o) => !o)}
            aria-expanded={calendarOpen}
          >
            <CalendarDays className="h-4 w-4" />
            Calendar
            {calendarOpen ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>

        {calendarOpen && (
          <div className="mt-4 max-h-[min(70vh,520px)] overflow-y-auto overscroll-contain rounded-xl border bg-card p-4 shadow-sm scrollbar-thin">
            <CalendarSidebar
              mobile
              onDateSelect={() => setCalendarOpen(false)}
            />
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,248px)_1fr]">
        <aside className="hidden lg:sticky lg:top-6 lg:block lg:self-start">
          <CalendarSidebar />
        </aside>

        <div className="min-w-0 space-y-6">
          <DailyAnchorCard />

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <StickyNote className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-base font-semibold">Quick Notes</h2>
              {notesTotal > 0 && (
                <span className="text-xs text-muted-foreground">
                  {notesTotal}
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
                {notesHasMore && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={loadMoreNotes}
                    disabled={loadingMoreNotes}
                  >
                    {loadingMoreNotes ? (
                      <>
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                        Loading…
                      </>
                    ) : (
                      `Load more (${notes.length} of ${notesTotal})`
                    )}
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
