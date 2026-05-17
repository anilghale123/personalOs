"use client";

import * as React from "react";
import {
  ChevronLeft,
  ChevronRight,
  Check,
  CloudOff,
  Loader2,
  Sparkles,
  X,
  Tag,
} from "lucide-react";
import { toast } from "sonner";
import { cn, toDateKey, formatDate } from "@/lib/utils";
import { useJournalStore } from "@/features/journal/store";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MoodPicker } from "@/features/journal/components/mood-picker";

/** Shift a 'YYYY-MM-DD' key by N days. */
function shiftDate(key, days) {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

function SaveStatus({ status }) {
  if (status === "saving") {
    return (
      <Badge variant="secondary" className="gap-1">
        <CloudOff className="h-3 w-3 text-amber-500" />
        Saving…
      </Badge>
    );
  }
  if (status === "error") {
    return (
      <Badge variant="secondary" className="gap-1">
        <CloudOff className="h-3 w-3 text-destructive" />
        Retrying…
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1">
      <Check className="h-3 w-3 text-emerald-500" />
      Saved
    </Badge>
  );
}

export function DailyAnchorCard() {
  const journal = useJournalStore((s) => s.journal);
  const activeDate = useJournalStore((s) => s.activeDate);
  const saveStatus = useJournalStore((s) => s.saveStatus);
  const loadingDay = useJournalStore((s) => s.loadingDay);
  const updateJournal = useJournalStore((s) => s.updateJournal);
  const selectDate = useJournalStore((s) => s.selectDate);
  const setAiSummary = useJournalStore((s) => s.setAiSummary);

  const textareaRef = React.useRef(null);
  const [tagDraft, setTagDraft] = React.useState("");
  const [reflecting, setReflecting] = React.useState(false);

  const j = journal || {
    date: activeDate,
    mood: null,
    title: "",
    content: "",
    tags: [],
    aiSummary: "",
  };
  const today = toDateKey();
  const isToday = activeDate === today;

  // Auto-grow the editor to fit its content.
  React.useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.max(el.scrollHeight, 200)}px`;
    }
  }, [j.content, activeDate, loadingDay]);

  function addTag() {
    const tag = tagDraft.trim().toLowerCase();
    if (!tag) return;
    if (!(j.tags || []).includes(tag)) {
      updateJournal({ tags: [...(j.tags || []), tag] });
    }
    setTagDraft("");
  }

  async function reflect() {
    setReflecting(true);
    try {
      const res = await fetch("/api/journal/reflect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: activeDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reflection failed");
      setAiSummary(data.aiSummary);
      toast.success("Reflection ready.");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setReflecting(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5 sm:p-6">
        {/* Date navigator */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button
              onClick={() => selectDate(shiftDate(activeDate, -1))}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Previous day"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[150px] text-center text-sm font-medium">
              {isToday ? "Today" : formatDate(activeDate)}
            </span>
            <button
              onClick={() => selectDate(shiftDate(activeDate, 1))}
              disabled={isToday}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
              aria-label="Next day"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            {!isToday && (
              <button
                onClick={() => selectDate(today)}
                className="ml-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Jump to today
              </button>
            )}
          </div>
          <SaveStatus status={saveStatus} />
        </div>

        {loadingDay ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <>
            <MoodPicker
              value={j.mood}
              onChange={(mood) => updateJournal({ mood })}
            />

            {/* Optional title */}
            <input
              value={j.title || ""}
              onChange={(e) => updateJournal({ title: e.target.value })}
              placeholder="Title your day (optional)"
              className="w-full border-0 bg-transparent text-lg font-semibold tracking-tight outline-none placeholder:font-normal placeholder:text-muted-foreground"
            />

            {/* Long-form reflection */}
            <textarea
              ref={textareaRef}
              value={j.content || ""}
              onChange={(e) => updateJournal({ content: e.target.value })}
              placeholder="What's on your mind? No pressure — a sentence is enough."
              className="w-full resize-none border-0 bg-transparent text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground"
              spellCheck
            />

            {/* Tags */}
            <div className="flex flex-wrap items-center gap-1.5 border-t pt-3">
              <Tag className="h-3.5 w-3.5 text-muted-foreground" />
              {(j.tags || []).map((tag) => (
                <span
                  key={tag}
                  className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs"
                >
                  {tag}
                  <button
                    onClick={() =>
                      updateJournal({
                        tags: j.tags.filter((t) => t !== tag),
                      })
                    }
                    aria-label={`Remove ${tag}`}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <input
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                onBlur={addTag}
                placeholder="Add tag…"
                className="min-w-[80px] flex-1 border-0 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              />
            </div>

            {/* AI reflection */}
            <div className="rounded-lg border border-brand/30 bg-brand/5 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-medium text-brand">
                  <Sparkles className="h-3.5 w-3.5" />
                  AI reflection
                </span>
                <button
                  onClick={reflect}
                  disabled={reflecting}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand transition-colors hover:bg-brand/10 disabled:opacity-50"
                >
                  {reflecting ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  {j.aiSummary ? "Refresh" : "Reflect on this day"}
                </button>
              </div>
              <p
                className={cn(
                  "mt-1.5 text-[13px] leading-relaxed",
                  j.aiSummary
                    ? "text-foreground"
                    : "text-muted-foreground"
                )}
              >
                {j.aiSummary ||
                  "Get a gentle, judgement-free reflection on your day once you've written a little."}
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
