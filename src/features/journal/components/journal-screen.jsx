"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Loader2,
  StickyNote,
} from "lucide-react";
import { formatDate, toDateKey } from "@/lib/utils";
import { useAppUser } from "@/components/app-user";
import { useClientClock } from "@/lib/client-clock";
import { markRead, shouldRead } from "@/lib/screen-data";
import { SkeletonParagraph } from "@/components/ui/skeleton";
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

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Shown while the day being opened is not the day the store kept. */
function JournalSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading your journal">
      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          {/* Mood row */}
          <div className="flex gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-10 rounded-full" />
            ))}
          </div>
          {/* The entry itself */}
          <div className="space-y-3 rounded-2xl bg-card elev-sm p-5">
            <Skeleton className="h-5 w-40" />
            <SkeletonParagraph lines={5} />
          </div>
          <Skeleton className="h-11 w-full rounded-xl" />
        </div>

        {/* Calendar sidebar, desktop only — matching the real layout */}
        <div className="hidden space-y-3 lg:block">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-56 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

export function JournalScreen() {
  const userId = useAppUser()?.id;
  const searchParams = useSearchParams();
  /**
   * `?date=` lets the evidence rows on a discovery link straight to the day
   * they were computed from. Anything malformed just opens today — and
   * "today" is read here, on the device, because the server's today is UTC's
   * and this route is prerendered besides.
   */
  const requested = searchParams.get("date");
  const [today] = useClientClock(() => toDateKey());
  const date = DATE_KEY.test(requested ?? "") ? requested : today;

  const hydrate = useJournalStore((s) => s.hydrate);
  const flushSave = useJournalStore((s) => s.flushSave);
  const activeDate = useJournalStore((s) => s.activeDate);
  const notes = useJournalStore((s) => s.notes);
  const notesTotal = useJournalStore((s) => s.notesTotal);
  const notesHasMore = useJournalStore((s) => s.notesHasMore);
  const loadingDay = useJournalStore((s) => s.loadingDay);
  const loadingMoreNotes = useJournalStore((s) => s.loadingMoreNotes);
  const loadMoreNotes = useJournalStore((s) => s.loadMoreNotes);
  const saveStatus = useJournalStore((s) => s.saveStatus);

  const [calendarOpen, setCalendarOpen] = React.useState(false);

  /**
   * Load the day.
   *
   * The page above this used to fetch it and pass it in, which made the
   * route dynamic — and a dynamic route is prefetched only as far as its
   * loading state, so opening Journal meant a skeleton and then a wait.
   *
   * Nothing is lost by moving it here: the store persists what was last on
   * screen, so it paints immediately, and `hydrate` refuses to overwrite an
   * unsaved draft with whatever the server still has.
   */
  React.useEffect(() => {
    if (!date || !userId) return undefined;
    // Cache first: the store persists the day it last held, so reopening the
    // journal on the same day costs nothing. Saving an entry or a note marks
    // it, which is what brings the server's copy back. See lib/screen-data.js.
    if (!shouldRead(userId, `journal:${date}`, activeDate === date)) {
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/journal/screen?date=${date}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (cancelled) return;
        // `hydrate` refuses to overwrite an unsaved draft with what the
        // server still has, so this is safe to run over live writing.
        hydrate(data);
        markRead(userId, `journal:${date}`);
      } catch {
        if (!cancelled) toast.error("Couldn't load your journal.");
      }
    })();
    return () => {
      cancelled = true;
    };
    // `activeDate` is read to decide whether anything is held, not to
    // re-run this: it changes as a *result* of hydrating.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, userId, hydrate]);

  // Read the status through a ref so these listeners are bound once — an
  // effect that re-ran on every status change would flush on its cleanup,
  // which is exactly the keystroke-driven saving we're removing.
  const statusRef = React.useRef(saveStatus);
  statusRef.current = saveStatus;

  // Saving is manual, but leaving the page must never cost the user their
  // writing: hiding the tab or unmounting flushes silently, and a real
  // navigation away warns while unsaved changes are pending.
  React.useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden" && statusRef.current !== "saved") {
        flushSave();
      }
    };
    const onBeforeUnload = (e) => {
      if (statusRef.current === "saved") return;
      e.preventDefault();
      e.returnValue = "";
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (statusRef.current !== "saved") flushSave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const orderedNotes = React.useMemo(() => {
    return [...notes].sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    });
  }, [notes]);

  const dateLabel = activeDate === today ? "Today" : formatDate(activeDate);

  /**
   * Until the clock has been read, or while what the store kept is a
   * different day from the one being opened, there is nothing honest to
   * show — a persisted copy of last Tuesday is worse than a placeholder.
   * An unsaved draft is the exception: that is the user's own writing and
   * it stays on screen.
   */
  if (!date || (activeDate !== date && saveStatus === "saved")) {
    return <JournalSkeleton />;
  }

  return (
    <div>
      {/* Mobile: sticky calendar toggle + current date (sits below the
          sticky brand bar, which is h-14) */}
      <div className="sticky top-14 z-20 -mx-4 mb-4 border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:hidden">
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
          <div className="mt-4 max-h-[min(70vh,520px)] overflow-y-auto overscroll-contain rounded-2xl bg-card elev-sm p-4 shadow-sm scrollbar-thin">
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
