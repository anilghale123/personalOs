"use client";

import * as React from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Save,
  Sparkles,
  Smile,
  Tag,
  X,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn, toDateKey } from "@/lib/utils";
import { useJournalStore } from "@/features/journal/store";
import { MoodPicker } from "@/features/journal/components/mood-picker";

/** 'YYYY-MM-DD' shifted by whole days, without tripping over timezones. */
export function shiftDate(key, days) {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

const STATUS_TEXT = {
  saving: "Saving…",
  error: "Still on this device",
  unsaved: "Unsaved changes",
  saved: "Saved",
};

function SaveStatus({ status }) {
  const dirty = status === "unsaved" || status === "error";
  return (
    <span
      className={cn(
        "text-xs",
        dirty ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
      )}
    >
      {STATUS_TEXT[status] || STATUS_TEXT.saved}
    </span>
  );
}

/** Explicit save control — the journal never writes on its own. */
function SaveButton({ status, onSave }) {
  const saving = status === "saving";
  const dirty = status === "unsaved" || status === "error";

  return (
    <button
      type="button"
      onClick={onSave}
      disabled={saving || !dirty}
      title={dirty ? "Save entry (Ctrl+S)" : "Everything is saved"}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
        dirty
          ? "bg-primary text-primary-foreground hover:bg-primary/90"
          : "text-muted-foreground"
      )}
    >
      {saving ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : dirty ? (
        <Save className="h-3.5 w-3.5" />
      ) : (
        <Check className="h-3.5 w-3.5" />
      )}
      {saving ? "Saving…" : dirty ? "Save" : "Saved"}
    </button>
  );
}

/** A Notion-style property row — a fixed-width label beside its control. */
function PropertyRow({ icon: Icon, label, children }) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-3">
      <div className="flex w-24 shrink-0 items-center gap-1.5 pt-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function DailyAnchorCard() {
  const journal = useJournalStore((s) => s.journal);
  const activeDate = useJournalStore((s) => s.activeDate);
  const saveStatus = useJournalStore((s) => s.saveStatus);
  const loadingDay = useJournalStore((s) => s.loadingDay);
  const updateJournal = useJournalStore((s) => s.updateJournal);
  const saveJournal = useJournalStore((s) => s.saveJournal);
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

  React.useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.max(el.scrollHeight, 320)}px`;
    }
  }, [j.content, activeDate, loadingDay]);

  // Ctrl/Cmd+S saves the entry instead of the browser's save dialog.
  React.useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveJournal();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [saveJournal]);

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

  const wordCount = (j.content || "").trim()
    ? (j.content || "").trim().split(/\s+/).length
    : 0;
  const dayLabel = format(new Date(`${activeDate}T12:00:00`), "EEEE, MMMM d, yyyy");

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => selectDate(shiftDate(activeDate, -1))}
            aria-label="Previous day"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => selectDate(shiftDate(activeDate, 1))}
            disabled={isToday}
            aria-label="Next day"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <span className="ml-1.5 text-sm font-medium">
            {isToday ? "Today" : dayLabel}
          </span>
          {!isToday && (
            <button
              type="button"
              onClick={() => selectDate(today)}
              className="ml-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Jump to today
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <SaveStatus status={saveStatus} />
          <SaveButton status={saveStatus} onSave={() => saveJournal()} />
        </div>
      </div>

      {loadingDay ? (
        <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading entry…
        </div>
      ) : (
        <div className="px-5 py-6 sm:px-8 sm:py-8">
          {isToday && (
            <p className="mb-1 text-xs text-muted-foreground">{dayLabel}</p>
          )}

          <input
            value={j.title || ""}
            onChange={(e) => updateJournal({ title: e.target.value })}
            placeholder="Untitled"
            aria-label="Entry title"
            className="w-full border-0 bg-transparent font-display text-2xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/40 sm:text-3xl"
          />

          {/* Properties */}
          <div className="mt-5 space-y-2.5">
            <PropertyRow icon={Smile} label="Mood">
              <MoodPicker
                value={j.mood}
                onChange={(mood) => updateJournal({ mood })}
              />
            </PropertyRow>

            <PropertyRow icon={Tag} label="Tags">
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {(j.tags || []).map((tag) => (
                  <span
                    key={tag}
                    className="flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
                  >
                    {tag}
                    <button
                      onClick={() =>
                        updateJournal({ tags: j.tags.filter((t) => t !== tag) })
                      }
                      aria-label={`Remove ${tag}`}
                      className="opacity-50 transition-opacity hover:opacity-100"
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
                  placeholder={(j.tags || []).length ? "Add another…" : "Add a tag…"}
                  aria-label="Add tag"
                  className="w-28 border-0 bg-transparent px-1 py-0.5 text-base outline-none placeholder:text-muted-foreground sm:text-xs"
                />
              </div>
            </PropertyRow>
          </div>

          <hr className="my-5 border-border" />

          <textarea
            ref={textareaRef}
            value={j.content || ""}
            onChange={(e) => updateJournal({ content: e.target.value })}
            placeholder="Start writing…"
            aria-label="Entry content"
            spellCheck
            className="w-full min-h-[320px] resize-none border-0 bg-transparent text-base leading-7 outline-none placeholder:text-muted-foreground/60"
          />

          {/* Reflection callout */}
          <div className="mt-6 rounded-lg border bg-muted/40 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" />
                AI reflection
              </span>
              <button
                onClick={reflect}
                disabled={reflecting}
                className="text-xs font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline disabled:opacity-50"
              >
                {reflecting ? "Thinking…" : j.aiSummary ? "Regenerate" : "Generate"}
              </button>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {j.aiSummary || "Generate a short reflection on what you wrote today."}
            </p>
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            {wordCount} {wordCount === 1 ? "word" : "words"}
          </p>
        </div>
      )}
    </div>
  );
}
