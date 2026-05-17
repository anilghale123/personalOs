"use client";

import * as React from "react";
import {
  ChevronLeft,
  ChevronRight,
  Check,
  CloudOff,
  CalendarDays,
} from "lucide-react";
import { cn, toDateKey, formatDate } from "@/lib/utils";
import { useSanctuaryStore } from "@/features/sanctuary/store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const MOODS = [
  { key: "amazing", emoji: "🤩", label: "Amazing" },
  { key: "good", emoji: "🙂", label: "Good" },
  { key: "okay", emoji: "😐", label: "Okay" },
  { key: "bad", emoji: "🙁", label: "Bad" },
  { key: "awful", emoji: "😣", label: "Awful" },
];

/** Shift a 'YYYY-MM-DD' key by N days. */
function shiftDate(key, days) {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

export function SanctuaryClient({ initialEntries }) {
  const {
    entries,
    activeDate,
    setActiveDate,
    updateEntry,
    hydrateEntry,
    flushAll,
  } = useSanctuaryStore();
  const textareaRef = React.useRef(null);

  // Hydrate local store with server entries (server wins for synced data).
  React.useEffect(() => {
    for (const e of initialEntries || []) {
      const local = useSanctuaryStore.getState().entries[e.date];
      if (!local || local.isSynced) {
        hydrateEntry(e.date, {
          content: e.content || "",
          mood: e.mood || null,
          tags: e.tags || [],
        });
      }
    }
    flushAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const entry = entries[activeDate] || {
    content: "",
    mood: null,
    tags: [],
    isSynced: true,
  };
  const today = toDateKey();
  const isToday = activeDate === today;

  // Auto-resize the editor to fit content.
  React.useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.max(el.scrollHeight, 320)}px`;
    }
  }, [entry.content, activeDate]);

  const wordCount = entry.content
    ? entry.content.trim().split(/\s+/).filter(Boolean).length
    : 0;

  const recent = React.useMemo(
    () =>
      Object.entries(entries)
        .filter(([, v]) => v.content?.trim() || v.mood)
        .sort((a, b) => b[0].localeCompare(a[0]))
        .slice(0, 8),
    [entries]
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
      <div>
        {/* Date navigator */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setActiveDate(shiftDate(activeDate, -1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[170px] text-center text-sm font-medium">
              {formatDate(activeDate)}
            </span>
            <Button
              variant="ghost"
              size="icon"
              disabled={isToday}
              onClick={() => setActiveDate(shiftDate(activeDate, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            {!isToday && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setActiveDate(today)}
              >
                Today
              </Button>
            )}
          </div>
          <Badge variant="secondary" className="gap-1">
            {entry.isSynced ? (
              <>
                <Check className="h-3 w-3 text-emerald-500" />
                Synced
              </>
            ) : (
              <>
                <CloudOff className="h-3 w-3 text-amber-500" />
                Saving…
              </>
            )}
          </Badge>
        </div>

        {/* Mood picker */}
        <div className="mb-3 flex gap-1.5">
          {MOODS.map((m) => (
            <button
              key={m.key}
              onClick={() =>
                updateEntry(activeDate, {
                  mood: entry.mood === m.key ? null : m.key,
                })
              }
              title={m.label}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-lg border text-lg transition-all",
                entry.mood === m.key
                  ? "border-foreground/30 bg-accent scale-105"
                  : "opacity-60 hover:opacity-100"
              )}
            >
              {m.emoji}
            </button>
          ))}
        </div>

        {/* Editor */}
        <Card>
          <CardContent className="p-6">
            <textarea
              ref={textareaRef}
              value={entry.content}
              onChange={(e) =>
                updateEntry(activeDate, { content: e.target.value })
              }
              placeholder="Write freely. Your words save automatically…"
              className="w-full resize-none border-0 bg-transparent text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground"
              spellCheck
            />
          </CardContent>
        </Card>

        <p className="mt-2 text-right text-xs text-muted-foreground">
          {wordCount} {wordCount === 1 ? "word" : "words"}
        </p>
      </div>

      {/* Recent entries */}
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5" />
          Recent entries
        </p>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No entries yet.
          </p>
        ) : (
          <div className="space-y-1.5">
            {recent.map(([date, v]) => {
              const mood = MOODS.find((m) => m.key === v.mood);
              return (
                <button
                  key={date}
                  onClick={() => setActiveDate(date)}
                  className={cn(
                    "w-full rounded-lg border px-3 py-2 text-left transition-colors",
                    date === activeDate
                      ? "border-foreground/30 bg-accent"
                      : "hover:bg-accent/60"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">
                      {formatDate(date)}
                    </span>
                    {mood && <span>{mood.emoji}</span>}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {v.content?.trim() || "No text"}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
