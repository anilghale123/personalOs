import { create } from "zustand";
import { toast } from "sonner";
import { toDateKey } from "@/lib/utils";
import { invalidateScreens } from "@/lib/screen-data";
import { asList } from "@/lib/snapshot";

const JSON_HEADERS = { "Content-Type": "application/json" };

/**
 * Discoveries store.
 *
 * Holds the stored insight feed and the state of the background run. The
 * page server-renders whatever is already stored so the feed paints
 * immediately; this store's job is to notice when that set is stale, ask
 * for a fresh run, and fold the result in — plus carry the feedback and
 * dismissal mutations, which are optimistic with rollback.
 *
 * The home screen seeds this from a copy saved on the device (see
 * DiscoveriesScreen) and always re-reads the server straight after, so a
 * saved feed is on screen for a moment at most — never trusted on its own.
 */
export const usePatternStore = create((set, get) => ({
  insights: [],
  readiness: null,
  meta: null,
  /** 'idle' | 'running' | 'error' */
  runStatus: "idle",
  hydrated: false,

  /**
   * Seed from the server-rendered payload. Coverage is not part of that
   * payload any more, so a lazily-loaded one is never clobbered here.
   */
  /**
   * Seed the feed.
   *
   * The payload may have come from this device's saved copy, so its shape is
   * not guaranteed — an older version of the app, or a write cut short by a
   * full disk, and this is called with something that does not destructure.
   * It used to take `({ insights, readiness, meta })` directly, which throws
   * on `undefined` and takes the whole screen down with it. See
   * lib/snapshot.js.
   */
  hydrate: (payload) =>
    set({
      insights: asList(payload?.insights),
      readiness: payload?.readiness ?? get().readiness ?? null,
      meta: payload?.meta ?? null,
      hydrated: true,
    }),

  /** True when no run has happened yet, or the stored set is past its TTL. */
  needsRun: () => {
    const meta = get().meta;
    if (!meta) return false;
    if (!meta.hasEverRun) return true;
    if (!meta.nextRunAt) return true;
    return new Date() >= new Date(meta.nextRunAt);
  },

  /**
   * How much data the engine can see. Fetched lazily — it is a ninety-day
   * scan across six collections, and it is only ever read to explain why
   * a run found nothing, so nothing on the home page should wait on it.
   */
  readinessStatus: "idle",
  loadReadiness: async () => {
    if (get().readiness || get().readinessStatus === "loading") return;
    set({ readinessStatus: "loading" });
    try {
      const res = await fetch("/api/patterns/readiness");
      if (!res.ok) throw new Error();
      const data = await res.json();
      set({ readiness: data.primary ?? null, readinessStatus: "ready" });
    } catch {
      set({ readinessStatus: "error" });
    }
  },

  /**
   * Ask the server to look for patterns.
   *
   * `force` is the user pressing "Check for new patterns" — it bypasses
   * the TTL but not the daily cap, which the route enforces and reports
   * back as a 429.
   */
  runPatterns: async ({ force = false, silent = false } = {}) => {
    if (get().runStatus === "running") return;
    set({ runStatus: "running" });

    try {
      const res = await fetch("/api/patterns/run", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ force }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 429) {
        set({ runStatus: "idle" });
        toast("You've checked a few times today — results refresh again tomorrow.");
        return;
      }
      if (!res.ok) throw new Error(data?.error || "Run failed");

      // A run rewrites the feed the home screen and the archive both read.
      invalidateScreens("discoveries-archive");

      // Inside the TTL the server serves what's stored rather than
      // recomputing; that's a success, not a failure.
      if (data.ran === false) {
        set({ runStatus: "idle" });
        if (!silent) toast("Your patterns are up to date.");
        return;
      }

      await get().refresh();
      set({ runStatus: "idle" });

      if (!silent) {
        const found = data?.runMeta?.found ?? 0;
        toast.success(
          found
            ? `${found} pattern${found === 1 ? "" : "s"} holding up right now.`
            : "Nothing held up statistically this time — that's a real result."
        );
      }
    } catch {
      set({ runStatus: "error" });
      if (!silent) toast.error("Couldn't check for patterns just now.");
    }
  },

  /** Re-read the stored feed after a run or a mutation. */
  refresh: async () => {
    try {
      const res = await fetch("/api/patterns/insights?status=active");
      if (!res.ok) throw new Error();
      const data = await res.json();
      set({ insights: data.insights ?? [], meta: { ...get().meta, ...data.meta, hasEverRun: true } });
    } catch {
      toast.error("Couldn't refresh your discoveries.");
    }
  },

  /** Mark a card as seen, so it stops competing for the headline slot. */
  markRead: async (id) => {
    const before = get().insights;
    if (before.find((i) => i.id === id)?.readAt) return;
    set({
      insights: before.map((i) =>
        i.id === id ? { ...i, readAt: new Date().toISOString() } : i
      ),
    });
    try {
      await fetch(`/api/patterns/insights/${id}`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify({ read: true }),
      });
    } catch {
      // A lost read receipt is not worth a toast or a rollback — the
      // worst case is the card leads once more.
    }
  },

  /** useful / not_useful / knew_it. */
  rateInsight: async (id, rating) => {
    const before = get().insights;
    set({
      insights: before.map((i) => (i.id === id ? { ...i, feedback: { rating } } : i)),
    });
    try {
      const res = await fetch(`/api/patterns/insights/${id}`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify({ rating }),
      });
      if (!res.ok) throw new Error();
      toast.success(
        rating === "knew_it" ? "Noted — we'll rank that lower." : "Thanks — noted."
      );
    } catch {
      set({ insights: before });
      toast.error("Couldn't save that just now.");
    }
  },

  /**
   * Hide an insight. The pattern keeps being tracked and keeps its
   * history — dismissal is a status change, never a delete.
   */
  dismissInsight: async (id) => {
    // See lib/screen-data.js — the archive and home both list these.
    invalidateScreens("discoveries-archive");

    const before = get().insights;
    set({ insights: before.filter((i) => i.id !== id) });
    try {
      const res = await fetch(`/api/patterns/insights/${id}`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify({ action: "dismiss" }),
      });
      if (!res.ok) throw new Error();
      toast("Hidden.", {
        action: { label: "Undo", onClick: () => get().restoreInsight(id) },
      });
    } catch {
      set({ insights: before });
      toast.error("Couldn't hide that just now.");
    }
  },

  /** Bring a dismissed insight back; a confirming run reactivates it. */
  restoreInsight: async (id) => {
    // See lib/screen-data.js — the archive and home both list these.
    invalidateScreens("discoveries-archive");

    try {
      const res = await fetch(`/api/patterns/insights/${id}`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify({ action: "undismiss" }),
      });
      if (!res.ok) throw new Error();
      await get().refresh();
      toast.success("Back in your discoveries.");
    } catch {
      toast.error("Couldn't restore that one.");
    }
  },

  /**
   * Quick mood log from the Discoveries home.
   *
   * Mood coverage is the binding constraint on most of the engine, so
   * this is the one capture affordance worth putting on the front page.
   * `PUT /api/journal` replaces the whole day, so the current entry is
   * read first and its writing passed straight back — setting a mood must
   * never cost someone their words.
   */
  logMood: async (mood) => {
    const date = toDateKey();
    try {
      const current = await fetch(`/api/journal?date=${date}&notesLimit=0&notesSkip=0`);
      const day = current.ok ? await current.json() : null;
      const journal = day?.journal ?? {};

      const res = await fetch("/api/journal", {
        method: "PUT",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          date,
          mood,
          title: journal.title || "",
          content: journal.content || "",
          tags: Array.isArray(journal.tags) ? journal.tags : [],
        }),
      });
      if (!res.ok) throw new Error();

      set({ moodLoggedToday: mood });
      toast.success("Logged — thanks.");
    } catch {
      toast.error("Couldn't save that mood.");
    }
  },

  moodLoggedToday: null,
  setMoodLoggedToday: (mood) => set({ moodLoggedToday: mood }),
}));
