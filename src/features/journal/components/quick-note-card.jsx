"use client";

import * as React from "react";
import { format } from "date-fns";
import { Pin, PinOff, Pencil, Trash2, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useJournalStore } from "@/features/journal/store";
import { noteTypeEmoji, noteTypeLabel } from "@/features/journal/constants";

const LONG = 240; // chars before a note collapses
const SWIPE_COMMIT = -96; // px of leftward drag that deletes on release

export function QuickNoteCard({ note }) {
  const updateNote = useJournalStore((s) => s.updateNote);
  const deleteNote = useJournalStore((s) => s.deleteNote);
  const togglePin = useJournalStore((s) => s.togglePin);

  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(note.content);
  const [expanded, setExpanded] = React.useState(false);

  // Swipe-to-delete (touch only — pointer users keep the hover buttons).
  const [swipeX, setSwipeX] = React.useState(0);
  const tracking = React.useRef(null);

  const isLong = note.content.length > LONG;
  const shown =
    isLong && !expanded ? `${note.content.slice(0, LONG)}…` : note.content;
  const stamp = note.createdAt ? new Date(note.createdAt) : null;

  function saveEdit() {
    const text = draft.trim();
    if (!text || text === note.content) {
      setEditing(false);
      setDraft(note.content);
      return;
    }
    updateNote(note._id, { content: text });
    setEditing(false);
  }

  function onTouchStart(e) {
    if (editing || note.isOptimistic) return;
    const t = e.touches[0];
    tracking.current = { x: t.clientX, y: t.clientY, axis: null };
  }

  function onTouchMove(e) {
    const t = tracking.current;
    if (!t) return;
    const dx = e.touches[0].clientX - t.x;
    const dy = e.touches[0].clientY - t.y;
    // Decide once: horizontal gesture swipes, vertical gesture scrolls.
    if (t.axis === null) t.axis = Math.abs(dx) > Math.abs(dy) + 6 ? "h" : "v";
    if (t.axis !== "h") return;
    setSwipeX(Math.max(Math.min(dx, 0), SWIPE_COMMIT - 24));
  }

  function onTouchEnd() {
    const t = tracking.current;
    tracking.current = null;
    if (t?.axis === "h" && swipeX <= SWIPE_COMMIT) {
      setSwipeX(0);
      deleteNote(note._id); // soft delete — the toast offers Undo
      return;
    }
    setSwipeX(0);
  }

  const card = (
    <div
      className={cn(
        "group rounded-xl border bg-card p-3 transition-colors",
        note.pinned
          ? "border-brand/40 bg-brand/[0.04]"
          : "hover:border-foreground/20",
        note.isOptimistic && "opacity-60"
      )}
    >
      {editing ? (
        <div className="space-y-2">
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                saveEdit();
              }
              if (e.key === "Escape") {
                setEditing(false);
                setDraft(note.content);
              }
            }}
            className="min-h-[60px] w-full resize-none rounded-lg border bg-background p-2 text-base outline-none focus-visible:border-foreground/30 sm:text-sm"
          />
          <div className="flex justify-end gap-1.5">
            <button
              onClick={() => {
                setEditing(false);
                setDraft(note.content);
              }}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
            >
              <X className="h-3 w-3" />
              Cancel
            </button>
            <button
              onClick={saveEdit}
              className="flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground"
            >
              <Check className="h-3 w-3" />
              Save
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {shown}
          </p>
          {isLong && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
          <div className="mt-2 flex items-center justify-between">
            <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
              {note.type && note.type !== "note" && (
                <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium">
                  {noteTypeEmoji(note.type)} {noteTypeLabel(note.type)}
                </span>
              )}
              {stamp ? format(stamp, "h:mm a") : ""}
              {note.pinned && <span className="text-brand">Pinned</span>}
            </span>
            <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <IconBtn
                label={note.pinned ? "Unpin" : "Pin"}
                onClick={() => togglePin(note._id)}
              >
                {note.pinned ? (
                  <PinOff className="h-3.5 w-3.5" />
                ) : (
                  <Pin className="h-3.5 w-3.5" />
                )}
              </IconBtn>
              <IconBtn label="Edit" onClick={() => setEditing(true)}>
                <Pencil className="h-3.5 w-3.5" />
              </IconBtn>
              <IconBtn
                label="Delete"
                onClick={() => deleteNote(note._id)}
                danger
              >
                <Trash2 className="h-3.5 w-3.5" />
              </IconBtn>
            </div>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Delete affordance revealed behind the card while swiping. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-end rounded-xl bg-negative pr-5 text-white"
        style={{ opacity: swipeX < -8 ? 1 : 0 }}
      >
        <Trash2 className="h-4 w-4" />
      </div>
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className="relative"
        style={{
          transform: swipeX ? `translateX(${swipeX}px)` : undefined,
          transition: tracking.current ? "none" : "transform 0.2s ease-out",
        }}
      >
        {card}
      </div>
    </div>
  );
}

function IconBtn({ children, label, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "rounded p-1 text-muted-foreground transition-colors hover:bg-accent",
        danger ? "hover:text-destructive" : "hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}
