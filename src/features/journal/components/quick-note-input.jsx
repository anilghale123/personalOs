"use client";

import * as React from "react";
import { CornerDownLeft, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useJournalStore } from "@/features/journal/store";
import { NOTE_TYPES } from "@/features/journal/constants";

/**
 * Friction-free quick capture. Enter sends, Shift+Enter adds a newline,
 * and focus is retained so thoughts can be dumped in rapid succession.
 */
export function QuickNoteInput() {
  const addNote = useJournalStore((s) => s.addNote);
  const [value, setValue] = React.useState("");
  const [type, setType] = React.useState("note");
  const ref = React.useRef(null);

  function resize() {
    const el = ref.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }
  }

  function submit() {
    const text = value.trim();
    if (!text) return;
    addNote(text, type);
    setValue("");
    requestAnimationFrame(() => {
      resize();
      ref.current?.focus();
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {NOTE_TYPES.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setType(t.key)}
            className={cn(
              "rounded-full border px-2 py-0.5 text-[11px] transition-colors",
              type === t.key
                ? "border-foreground/25 bg-accent font-medium"
                : "border-transparent text-muted-foreground hover:bg-accent/60"
            )}
          >
            {t.emoji} {t.label}
          </button>
        ))}
      </div>
      <div className="flex items-end gap-2 rounded-xl border bg-card p-2 shadow-sm focus-within:border-foreground/25">
        <textarea
          ref={ref}
          rows={1}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            resize();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Capture a quick thought…"
          className="max-h-40 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
        />
        <button
          onClick={submit}
          disabled={!value.trim()}
          className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </button>
      </div>
    </div>
  );
}

/** Hint shown beneath the input. */
export function QuickNoteHint() {
  return (
    <p className="mt-1.5 flex items-center gap-1 px-1 text-[11px] text-muted-foreground">
      <CornerDownLeft className="h-3 w-3" />
      Enter to save · Shift+Enter for a new line
    </p>
  );
}
