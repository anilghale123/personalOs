"use client";

import * as React from "react";
import { subDays } from "date-fns";
import { cn, toDateKey } from "@/lib/utils";
import { useJournalStore } from "@/features/journal/store";
import { MOOD_DOT } from "@/features/journal/components/mood-picker";

const DAYS = 30;

/**
 * Compact 30-day mood strip — one cell per day, coloured by mood.
 */
export function MoodTrendStrip({ onDateSelect }) {
  const calendar = useJournalStore((s) => s.calendar);
  const mergeCalendar = useJournalStore((s) => s.mergeCalendar);
  const selectDate = useJournalStore((s) => s.selectDate);
  const activeDate = useJournalStore((s) => s.activeDate);

  function pickDay(key) {
    selectDate(key);
    onDateSelect?.();
  }

  const days = React.useMemo(() => {
    const today = new Date();
    return Array.from({ length: DAYS }, (_, i) => {
      const d = subDays(today, DAYS - 1 - i);
      return toDateKey(d);
    });
  }, []);

  React.useEffect(() => {
    const from = days[0];
    const to = days[days.length - 1];
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
  }, []);

  const moodCount = days.filter((d) => calendar[d]?.mood).length;

  return (
    <div className="space-y-2 border-t pt-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Mood — last {DAYS} days
        </p>
        <span className="text-[11px] text-muted-foreground">
          {moodCount} logged
        </span>
      </div>
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-thin sm:gap-0.5">
        {days.map((key) => {
          const mood = calendar[key]?.mood;
          const selected = key === activeDate;
          return (
            <button
              key={key}
              type="button"
              title={key}
              onClick={() => pickDay(key)}
              className={cn(
                "h-7 w-7 shrink-0 rounded-sm transition-all sm:h-5 sm:min-w-0 sm:flex-1",
                mood ? MOOD_DOT[mood] : "bg-muted",
                selected &&
                  "ring-2 ring-foreground ring-offset-1 ring-offset-background"
              )}
            />
          );
        })}
      </div>
    </div>
  );
}
