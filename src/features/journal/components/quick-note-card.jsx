"use client";

import * as React from "react";
import { format } from "date-fns";
import { Pin, PinOff, Pencil, Trash2, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useJournalStore } from "@/features/journal/store";

const LONG = 240; // chars before a note collapses

export function QuickNoteCard({ note }) {
  const updateNote = useJournalStore((s) => s.updateNote);
  const deleteNote = useJournalStore((s) => s.deleteNote);
  const togglePin = useJournalStore((s) => s.togglePin);

  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(note.content);
  const [expanded, setExpanded] = React.useState(false);

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

  return (
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
            className="min-h-[60px] w-full resize-none rounded-lg border bg-background p-2 text-sm outline-none focus-visible:border-foreground/30"
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
            <span className="text-[11px] text-muted-foreground">
              {stamp ? format(stamp, "h:mm a") : ""}
              {note.pinned && (
                <span className="ml-2 text-brand">Pinned</span>
              )}
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
