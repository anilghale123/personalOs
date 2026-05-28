"use client";

import * as React from "react";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Sparkles,
  X,
  Tag,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { toDateKey, formatDate } from "@/lib/utils";
import { useJournalStore } from "@/features/journal/store";
import { MoodPicker } from "@/features/journal/components/mood-picker";
import {
  DiaryPageFlip,
  dispatchDiaryNavigate,
  shiftDate,
} from "@/features/journal/components/diary-page-flip";

function SaveHint({ status }) {
  if (status === "saving") return <span className="diary-save-hint">Saving…</span>;
  if (status === "error") return <span className="diary-save-hint text-[#8b2500]">Retrying…</span>;
  return <span className="diary-save-hint">Saved</span>;
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

  React.useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.max(el.scrollHeight, 280)}px`;
    }
  }, [j.content, activeDate, loadingDay]);

  function goPrev() {
    dispatchDiaryNavigate("prev", shiftDate(activeDate, -1));
  }

  function goNext() {
    if (isToday) return;
    dispatchDiaryNavigate("next", shiftDate(activeDate, 1));
  }

  function goToday() {
    if (activeDate === today) return;
    const direction = today > activeDate ? "next" : "prev";
    dispatchDiaryNavigate(direction, today);
  }

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

  const pageLabel = isToday ? "आज — Today" : formatDate(activeDate);
  const pageFoot = format(
    new Date(`${activeDate}T12:00:00`),
    "EEEE · MMM d, yyyy"
  );

  return (
    <DiaryPageFlip activeDate={activeDate} onNavigate={selectDate}>
      <div className="relative z-[1] space-y-5 overflow-hidden py-5 pl-6 pr-5 sm:py-7 sm:pl-8 sm:pr-6">
        {/* Date + navigation */}
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={goPrev}
            className="diary-nav-btn"
            aria-label="Previous day"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>

          <div className="min-w-0 flex-1 text-center">
            <p className="diary-date-label text-base font-semibold text-[#3d2914] sm:text-lg">
              {pageLabel}
            </p>
            {!isToday && (
              <button
                type="button"
                onClick={goToday}
                className="mt-0.5 text-xs text-[#6b5344] underline-offset-2 hover:underline"
              >
                Today
              </button>
            )}
            <div className="mt-0.5">
              <SaveHint status={saveStatus} />
            </div>
          </div>

          <button
            type="button"
            onClick={goNext}
            disabled={isToday}
            className="diary-nav-btn"
            aria-label="Next day"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </div>

        {loadingDay ? (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-[#6b5344]">
            <Loader2 className="h-5 w-5 animate-spin" />
            Turning page…
          </div>
        ) : (
          <>
            <MoodPicker
              variant="paper"
              value={j.mood}
              onChange={(mood) => updateJournal({ mood })}
            />

            <input
              value={j.title || ""}
              onChange={(e) => updateJournal({ title: e.target.value })}
              placeholder="Title (optional)"
              className="journal-lokta-input w-full border-0 bg-transparent text-xl font-semibold outline-none placeholder:font-normal placeholder:text-[#6b5344]/60 dark:text-[#e8dcc8]"
            />

            <textarea
              ref={textareaRef}
              value={j.content || ""}
              onChange={(e) => updateJournal({ content: e.target.value })}
              placeholder="Write here…"
              className="journal-lokta-input w-full min-h-[280px] resize-none border-0 bg-transparent text-[16px] leading-relaxed outline-none sm:text-[17px] dark:text-[#e8dcc8]"
              spellCheck
            />

            {(j.tags || []).length > 0 || tagDraft ? (
              <div className="flex flex-wrap items-center gap-2">
                <Tag className="h-3.5 w-3.5 text-[#6b5344]/60" />
                {(j.tags || []).map((tag) => (
                  <span
                    key={tag}
                    className="flex items-center gap-1 text-xs text-[#6b5344]"
                  >
                    #{tag}
                    <button
                      onClick={() =>
                        updateJournal({
                          tags: j.tags.filter((t) => t !== tag),
                        })
                      }
                      aria-label={`Remove ${tag}`}
                      className="opacity-50 hover:opacity-100"
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
                  placeholder="tag"
                  className="journal-lokta-input w-16 border-0 bg-transparent text-xs outline-none"
                />
              </div>
            ) : (
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
                className="journal-lokta-input w-full max-w-[120px] border-0 bg-transparent text-xs text-[#6b5344]/60 outline-none"
              />
            )}

            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1 text-xs text-[#6b5344]">
                  <Sparkles className="h-3 w-3" />
                  Reflection
                </span>
                <button
                  onClick={reflect}
                  disabled={reflecting}
                  className="text-xs text-[#8b2500] underline-offset-2 hover:underline disabled:opacity-50"
                >
                  {reflecting ? "…" : j.aiSummary ? "Refresh" : "Generate"}
                </button>
              </div>
              {j.aiSummary && (
                <p className="text-[14px] leading-relaxed text-[#3d2914]/90">
                  {j.aiSummary}
                </p>
              )}
            </div>

            <p className="diary-page-number">{pageFoot}</p>
          </>
        )}
      </div>
    </DiaryPageFlip>
  );
}
