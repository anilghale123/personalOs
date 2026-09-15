"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Archive,
  Bug,
  Heart,
  HelpCircle,
  Inbox,
  Lightbulb,
  Loader2,
  MailOpen,
  MessageSquare,
  RotateCcw,
  StickyNote,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const TABS = [
  { id: "new", label: "New" },
  { id: "read", label: "Read" },
  { id: "archived", label: "Archived" },
  { id: "all", label: "All" },
];

const TYPE_META = {
  bug: { label: "Bug", icon: Bug },
  confusing: { label: "Confusing", icon: HelpCircle },
  idea: { label: "Idea", icon: Lightbulb },
  praise: { label: "Praise", icon: Heart },
  other: { label: "Other", icon: MessageSquare },
};

function when(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function FeedbackInbox({ status, counts, initial }) {
  const router = useRouter();
  const [items, setItems] = React.useState(initial.items);
  const [cursor, setCursor] = React.useState(initial.nextCursor);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [busyId, setBusyId] = React.useState(null);
  const [noteFor, setNoteFor] = React.useState(null);
  const [noteDraft, setNoteDraft] = React.useState("");

  async function loadMore() {
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ status, cursor });
      const res = await fetch(`/api/admin/feedback?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not load more.");
      setItems((list) => [...list, ...data.items]);
      setCursor(data.nextCursor);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoadingMore(false);
    }
  }

  async function patch(id, body, message) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/feedback/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "That change did not apply.");

      setItems((list) =>
        list
          .map((it) => (it.id === id ? { ...it, ...data.item } : it))
          // Leaving the current tab's status removes it from this view.
          .filter((it) => status === "all" || it.status === status)
      );
      if (message) toast.success(message);
      // Tab counts come from the server.
      if (body.status) router.refresh();
      return true;
    } catch (err) {
      toast.error(err.message);
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function saveNote(id) {
    if (await patch(id, { adminNote: noteDraft.trim() }, "Note saved.")) {
      setNoteFor(null);
    }
  }

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-1.5" aria-label="Feedback status">
        {TABS.map((tab) => {
          const active = tab.id === status;
          const count = tab.id === "all" ? null : counts[tab.id];
          return (
            <Link
              key={tab.id}
              href={tab.id === "new" ? "/sysadmin/feedback" : `/sysadmin/feedback?status=${tab.id}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors",
                active
                  ? "bg-foreground font-medium text-background"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
              {count != null && <span className="tabular-nums opacity-70">{count}</span>}
            </Link>
          );
        })}
      </nav>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-background px-4 py-12 text-center text-sm text-muted-foreground">
          <Inbox className="h-6 w-6" />
          Nothing here.
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            const meta = TYPE_META[item.type] ?? TYPE_META.other;
            const Icon = meta.icon;
            const busy = busyId === item.id;
            return (
              <li
                key={item.id}
                className={cn(
                  "rounded-xl border border-border bg-background p-4",
                  item.status === "new" && "border-l-4 border-l-primary"
                )}
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-medium text-foreground">
                    <Icon className="h-3 w-3" />
                    {meta.label}
                  </span>
                  <span>{item.email ?? "anonymous"}</span>
                  {item.route && <code className="rounded bg-muted px-1.5 py-0.5">{item.route}</code>}
                  <span className="ml-auto tabular-nums">{when(item.createdAt)}</span>
                </div>

                <p className="mt-2.5 whitespace-pre-wrap break-words text-sm leading-relaxed">
                  {item.message}
                </p>

                {item.adminNote && noteFor !== item.id && (
                  <p className="mt-2.5 flex items-start gap-1.5 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                    <StickyNote className="mt-0.5 h-3 w-3 shrink-0" />
                    <span className="whitespace-pre-wrap">{item.adminNote}</span>
                  </p>
                )}

                {noteFor === item.id && (
                  <div className="mt-2.5 space-y-2">
                    <textarea
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value.slice(0, 2000))}
                      rows={3}
                      autoFocus
                      placeholder="Internal note — never shown to the sender"
                      className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" disabled={busy} onClick={() => saveNote(item.id)}>
                        Save note
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setNoteFor(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  {item.status === "new" && (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => patch(item.id, { status: "read" }, "Marked as read.")}>
                      <MailOpen className="h-3.5 w-3.5" />
                      Mark read
                    </Button>
                  )}
                  {item.status !== "archived" ? (
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => patch(item.id, { status: "archived" }, "Archived.")}>
                      <Archive className="h-3.5 w-3.5" />
                      Archive
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => patch(item.id, { status: "new" }, "Moved back to New.")}>
                      <RotateCcw className="h-3.5 w-3.5" />
                      Restore
                    </Button>
                  )}
                  {noteFor !== item.id && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        setNoteFor(item.id);
                        setNoteDraft(item.adminNote ?? "");
                      }}
                    >
                      <StickyNote className="h-3.5 w-3.5" />
                      {item.adminNote ? "Edit note" : "Add note"}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {cursor && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load older"}
          </Button>
        </div>
      )}
    </div>
  );
}
