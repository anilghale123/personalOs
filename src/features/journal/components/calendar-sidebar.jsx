"use client";

import * as React from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  format,
  isSameMonth,
} from "date-fns";
import { ChevronLeft, ChevronRight, Search, X, Loader2 } from "lucide-react";
import { cn, toDateKey, formatDate } from "@/lib/utils";
import { useJournalStore } from "@/features/journal/store";
import { Input } from "@/components/ui/input";
import { MOOD_DOT, MOOD_TINT } from "@/features/journal/components/mood-picker";
import { MoodTrendStrip } from "@/features/journal/components/mood-trends";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

export function CalendarSidebar({ onDateSelect, mobile = false }) {
  const activeDate = useJournalStore((s) => s.activeDate);
  const calendar = useJournalStore((s) => s.calendar);
  const recents = useJournalStore((s) => s.recents);
  const selectDate = useJournalStore((s) => s.selectDate);
  const mergeCalendar = useJournalStore((s) => s.mergeCalendar);

  const [viewMonth, setViewMonth] = React.useState(() =>
    startOfMonth(new Date())
  );
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState(null);
  const [searching, setSearching] = React.useState(false);

  const pickDate = (date) => {
    selectDate(date);
    onDateSelect?.();
  };

  const today = toDateKey();
  const gridDays = React.useMemo(() => {
    const start = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [viewMonth]);

  // Load calendar data whenever the displayed month changes.
  React.useEffect(() => {
    const from = toDateKey(gridDays[0]);
    const to = toDateKey(gridDays[gridDays.length - 1]);
    let cancelled = false;
    fetch(`/api/journal/calendar?from=${from}&to=${to}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.calendar) mergeCalendar(data.calendar);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMonth]);

  // Debounced search.
  React.useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/journal/search?q=${encodeURIComponent(q)}`
        );
        const data = await res.json();
        setResults(data.results || []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div className="space-y-5">
      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search entries…"
          className="h-9 pl-8 pr-8"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {results !== null ? (
        <SearchResults
          results={results}
          searching={searching}
          onPick={(date) => {
            pickDate(date);
            setQuery("");
          }}
        />
      ) : (
        <>
          {/* Calendar */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium">
                {format(viewMonth, "MMMM yyyy")}
              </span>
              <div className="flex">
                <button
                  className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                  onClick={() => setViewMonth((m) => addMonths(m, -1))}
                  aria-label="Previous month"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
                  onClick={() => setViewMonth((m) => addMonths(m, 1))}
                  disabled={isSameMonth(viewMonth, new Date())}
                  aria-label="Next month"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className={cn("grid grid-cols-7", mobile ? "gap-1.5" : "gap-1")}>
              {WEEKDAYS.map((d, i) => (
                <div
                  key={i}
                  className={cn(
                    "pb-1 text-center font-medium uppercase text-muted-foreground",
                    mobile ? "text-xs" : "text-[10px]"
                  )}
                >
                  {d}
                </div>
              ))}
              {gridDays.map((day) => {
                const key = toDateKey(day);
                const inMonth = isSameMonth(day, viewMonth);
                const isFuture = key > today;
                const data = calendar[key];
                const selected = key === activeDate;
                const hasEntry =
                  data && (data.hasContent || data.noteCount > 0 || data.mood);
                return (
                  <button
                    key={key}
                    disabled={isFuture}
                    onClick={() => pickDate(key)}
                    className={cn(
                      "relative flex items-center justify-center rounded-lg font-medium transition-colors",
                      mobile
                        ? "min-h-[44px] min-w-0 text-sm"
                        : "aspect-square text-xs",
                      data?.mood && MOOD_TINT[data.mood],
                      !inMonth && "opacity-35",
                      isFuture && "cursor-not-allowed opacity-25",
                      selected
                        ? "ring-2 ring-foreground ring-offset-1 ring-offset-background"
                        : !isFuture && "hover:bg-accent active:scale-95",
                      key === today && !selected && "font-bold"
                    )}
                  >
                    {format(day, "d")}
                    {hasEntry && !data?.mood && (
                      <span className="absolute bottom-1.5 h-1.5 w-1.5 rounded-full bg-foreground/45" />
                    )}
                    {data?.noteCount > 0 && (
                      <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-brand" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Recent entries */}
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Recent
            </p>
            {recents.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No entries yet.
              </p>
            ) : (
              <div className="space-y-0.5">
                {recents.map((r) => (
                  <button
                    key={r.date}
                    onClick={() => pickDate(r.date)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                      r.date === activeDate
                        ? "bg-accent"
                        : "hover:bg-accent/60"
                    )}
                  >
                    <span
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full",
                        r.mood ? MOOD_DOT[r.mood] : "bg-border"
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">
                        {r.title?.trim() || formatDate(r.date)}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {r.content?.trim()
                          ? r.content
                          : "Quick notes only"}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <MoodTrendStrip onDateSelect={onDateSelect} />
        </>
      )}
    </div>
  );
}

function SearchResults({ results, searching, onPick }) {
  if (searching) {
    return (
      <div className="flex items-center gap-2 px-1 py-4 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Searching…
      </div>
    );
  }
  if (!results.length) {
    return (
      <p className="px-1 py-4 text-xs text-muted-foreground">
        No matching entries.
      </p>
    );
  }
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {results.length} {results.length === 1 ? "day" : "days"}
      </p>
      {results.map((r) => (
        <button
          key={r.date}
          onClick={() => onPick(r.date)}
          className="w-full rounded-lg border px-2.5 py-2 text-left transition-colors hover:bg-accent/60"
        >
          <span className="text-xs font-medium">{formatDate(r.date)}</span>
          {r.journal?.title && (
            <span className="mt-0.5 block truncate text-xs">
              {r.journal.title}
            </span>
          )}
          {r.journal?.snippet && (
            <span className="mt-0.5 block line-clamp-2 text-[11px] text-muted-foreground">
              {r.journal.snippet}
            </span>
          )}
          {r.notes.length > 0 && (
            <span className="mt-1 block text-[11px] text-muted-foreground">
              {r.notes.length} matching note
              {r.notes.length === 1 ? "" : "s"}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
