"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { formatDistanceToNowStrict } from "date-fns";
import { AlarmClock, Bell, BellRing, CalendarCheck, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppUser } from "@/components/app-user";

/** How often an open, visible app re-checks the inbox. */
const POLL_MS = 60_000;
const JSON_HEADERS = { "Content-Type": "application/json" };

const KIND_ICON = {
  "goal-time": AlarmClock,
  daily: CalendarCheck,
  test: BellRing,
};

/**
 * The notification bell — top right on every screen, with an unread badge
 * and a dropdown inbox, the way Facebook's works.
 *
 * Every reminder is written to the inbox as well as pushed, so this shows
 * what was sent even when the system notification never appeared. Polling
 * the inbox also runs the caller's goal-time check (see /api/notifications),
 * so goal reminders arrive here while the app is open without any scheduler.
 *
 * Rendered once, from the app layout, fixed in place: on a phone it sits in
 * the top bar, on a wide screen in the top-right corner.
 */
export function NotificationBell() {
  const userId = useAppUser()?.id;
  const router = useRouter();
  const pathname = usePathname();
  const [items, setItems] = React.useState([]);
  const [unread, setUnread] = React.useState(0);
  const [loaded, setLoaded] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef(null);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.items ?? []);
      setUnread(data.unread ?? 0);
      setLoaded(true);
    } catch {
      // Offline — keep showing what we have.
    }
  }, []);

  // Load on sign-in, then poll while visible, refresh on return to the tab,
  // and straight away when the service worker says a push just arrived.
  React.useEffect(() => {
    if (!userId) return;
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    const onMessage = (event) => {
      if (event.data?.type === "NOTIFICATION") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, [userId, load]);

  // Close on navigation, outside tap, or Escape.
  React.useEffect(() => setOpen(false), [pathname]);
  React.useEffect(() => {
    if (!open) return;
    const onPointer = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function markRead(ids) {
    const now = new Date().toISOString();
    const hits = (n) => !n.readAt && (!ids || ids.includes(n._id));
    setUnread((count) => Math.max(0, count - items.filter(hits).length));
    setItems((list) => list.map((n) => (hits(n) ? { ...n, readAt: now } : n)));
    fetch("/api/notifications/read", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(ids ? { ids } : {}),
    }).catch(() => {});
  }

  function openItem(item) {
    if (!item.readAt) markRead([item._id]);
    setOpen(false);
    if (item.url && item.url !== pathname) router.push(item.url);
  }

  if (!userId) return null;

  return (
    <div
      ref={rootRef}
      className="fixed right-3 top-[calc(env(safe-area-inset-top)+0.5rem)] z-40 md:right-6 md:top-2"
    >
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) load();
        }}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        className={cn(
          "relative flex h-10 w-10 items-center justify-center rounded-full transition-colors",
          open ? "bg-primary/10 text-primary" : "text-foreground hover:bg-accent md:bg-card md:elev-sm"
        )}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground ring-2 ring-background">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+3.75rem)] overflow-hidden rounded-2xl border bg-popover text-popover-foreground elev-lg md:absolute md:inset-x-auto md:right-0 md:top-12 md:w-96"
        >
          <div className="flex items-center justify-between border-b px-4 py-3">
            <p className="text-base font-semibold">Notifications</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markRead()}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all as read
              </button>
            )}
          </div>

          <div className="max-h-[min(70dvh,480px)] overflow-y-auto">
            {!loaded ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">Loading…</p>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                <Bell className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm font-medium">No notifications yet</p>
                <p className="text-xs text-muted-foreground">
                  Give a planner goal a time — if it&apos;s not checked by then, the reminder
                  shows up here.
                </p>
              </div>
            ) : (
              <ul>
                {items.map((item) => {
                  const Icon = KIND_ICON[item.kind] ?? Bell;
                  const isUnread = !item.readAt;
                  return (
                    <li key={item._id}>
                      <button
                        type="button"
                        onClick={() => openItem(item)}
                        className={cn(
                          "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent",
                          isUnread && "bg-primary/5"
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                            isUnread ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              "block text-sm leading-snug",
                              isUnread ? "font-semibold" : "font-medium"
                            )}
                          >
                            {item.title}
                          </span>
                          {item.body && (
                            <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">
                              {item.body}
                            </span>
                          )}
                          <span
                            className={cn(
                              "mt-1 block text-xs",
                              isUnread ? "font-medium text-primary" : "text-muted-foreground"
                            )}
                          >
                            {formatDistanceToNowStrict(new Date(item.createdAt), {
                              addSuffix: true,
                            })}
                          </span>
                        </span>
                        {isUnread && (
                          <span
                            aria-label="Unread"
                            className="mt-3 h-2.5 w-2.5 shrink-0 rounded-full bg-primary"
                          />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
