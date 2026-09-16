import { create } from "zustand";
import { persist } from "zustand/middleware";
import { toast } from "sonner";
import { toDateKey } from "@/lib/utils";
import { NOTE_PAGE_SIZE } from "@/features/journal/constants";
import { invalidateScreens } from "@/lib/screen-data";

const JSON_HEADERS = { "Content-Type": "application/json" };

/**
 * Move what the previous build saved under the un-prefixed key.
 *
 * Runs once, before the store is created, so someone who had an unsaved
 * entry open when this shipped does not lose it. Safe to delete once no
 * installed client can still be on the old name.
 */
function migrateLegacyKey() {
  if (typeof window === "undefined") return;
  try {
    const legacy = localStorage.getItem("journal-store");
    if (legacy && !localStorage.getItem("pos-journal-store")) {
      localStorage.setItem("pos-journal-store", legacy);
    }
    localStorage.removeItem("journal-store");
  } catch {
    // Storage blocked. Nothing to carry over, and nothing left behind.
  }
}

migrateLegacyKey();

/** Empty anchor-journal draft for a day with no entry yet. */
function emptyJournal(date) {
  return { date, mood: null, title: "", content: "", tags: [], aiSummary: "" };
}

/** True when the live draft still matches the payload we sent to the server. */
function matchesPayload(draft, payload) {
  if (!draft) return false;
  return (
    (draft.mood ?? null) === payload.mood &&
    (draft.title || "") === payload.title &&
    (draft.content || "") === payload.content &&
    JSON.stringify(Array.isArray(draft.tags) ? draft.tags : []) ===
      JSON.stringify(payload.tags)
  );
}

/**
 * Journal store — orchestrates the daily anchor journal and quick notes.
 * The anchor journal is saved explicitly (Save button / Ctrl+S) — typing only
 * updates the local draft, which persists to localStorage so nothing is lost.
 * Quick notes are created and mutated optimistically with rollback on failure.
 */
export const useJournalStore = create(
  persist(
    (set, get) => ({
      activeDate: toDateKey(),
      journal: null,
      notes: [],
      notesTotal: 0,
      notesHasMore: false,
      calendar: {},
      recents: [],
      /** "saved" | "unsaved" | "saving" | "error" */
      saveStatus: "saved",
      loadingDay: false,
      loadingMoreNotes: false,
      _saving: false,

      /** Seed the store with server-rendered data for the initial day. */
      hydrate: ({ date, journal, notes, calendar, recents, notesTotal, notesHasMore }) => {
        const local = get();
        const hasLocalDraft =
          local.saveStatus !== "saved" &&
          local.journal &&
          local.activeDate === date;

        set({
          activeDate: date,
          journal: hasLocalDraft ? local.journal : journal,
          notes: hasLocalDraft ? local.notes : notes || [],
          notesTotal: hasLocalDraft
            ? local.notesTotal || (notes || []).length
            : notesTotal ?? (notes || []).length,
          notesHasMore: hasLocalDraft
            ? local.notesHasMore
            : Boolean(notesHasMore),
          calendar: { ...(calendar || {}), ...local.calendar },
          recents: recents || [],
          // A recovered draft always comes back as "unsaved" — a status of
          // "saving" from a reload mid-request would otherwise be a lie.
          saveStatus: hasLocalDraft ? "unsaved" : "saved",
          _saving: false,
        });
      },

      mergeCalendar: (map) =>
        set({ calendar: { ...get().calendar, ...map } }),

      selectDate: async (date) => {
        if (date === get().activeDate) return;
        // Leaving the day would replace the draft in memory — persist it first,
        // and stay put if that fails so nothing written is lost.
        if (get().saveStatus !== "saved") {
          const ok = await get().saveJournal({ silent: true });
          if (!ok) {
            toast.error(
              "Couldn't save this page — tap Save before switching days."
            );
            return;
          }
        }
        set({ activeDate: date, loadingDay: true });
        try {
          const res = await fetch(
            `/api/journal?date=${date}&notesLimit=${NOTE_PAGE_SIZE}&notesSkip=0`
          );
          if (!res.ok) throw new Error();
          const data = await res.json();
          set({
            journal: data.journal,
            notes: data.notes || [],
            notesTotal: data.notesTotal ?? (data.notes || []).length,
            notesHasMore: Boolean(data.notesHasMore),
            loadingDay: false,
            saveStatus: "saved",
          });
        } catch {
          set({ loadingDay: false });
          toast.error("Could not load that day.");
        }
      },

      loadMoreNotes: async () => {
        if (!get().notesHasMore || get().loadingMoreNotes) return;
        const date = get().activeDate;
        const skip = get().notes.length;
        set({ loadingMoreNotes: true });
        try {
          const res = await fetch(
            `/api/journal?date=${date}&notesLimit=${NOTE_PAGE_SIZE}&notesSkip=${skip}`
          );
          if (!res.ok) throw new Error();
          const data = await res.json();
          const existing = new Set(get().notes.map((n) => String(n._id)));
          const fresh = (data.notes || []).filter(
            (n) => !existing.has(String(n._id))
          );
          set({
            notes: [...get().notes, ...fresh],
            notesTotal: data.notesTotal ?? get().notesTotal,
            notesHasMore: Boolean(data.notesHasMore),
            loadingMoreNotes: false,
          });
        } catch {
          set({ loadingMoreNotes: false });
          toast.error("Could not load more notes.");
        }
      },

      /** Local-only edit. Nothing is sent until the user saves. */
      updateJournal: (patch) => {
        const date = get().activeDate;
        const current = get().journal || emptyJournal(date);
        set({ journal: { ...current, ...patch }, saveStatus: "unsaved" });
      },

      /**
       * Persist the current day's entry. Returns true on success.
       * Never clobbers the live draft: if the user kept typing while the
       * request was in flight, their text wins and the day stays "unsaved".
       */
      saveJournal: async ({ silent = false } = {}) => {
        // The day on screen is already correct — it was patched in place.
        // This marks the home briefing, which reads the journal, and the
        // day itself for its next open. See lib/screen-data.js.
        invalidateScreens("journal");

        const j = get().journal;
        if (!j || get().saveStatus === "saved") return true;
        if (get()._saving) return false;

        const payload = {
          date: j.date || get().activeDate,
          mood: j.mood ?? null,
          title: j.title || "",
          content: j.content || "",
          tags: Array.isArray(j.tags) ? j.tags : [],
        };

        set({ _saving: true, saveStatus: "saving" });
        try {
          const res = await fetch("/api/journal", {
            method: "PUT",
            headers: JSON_HEADERS,
            body: JSON.stringify(payload),
          });
          if (!res.ok) throw new Error();
          const saved = await res.json();

          const live = get().journal;
          const unchanged = matchesPayload(live, payload);
          const prevCal = get().calendar;
          set({
            journal: unchanged
              ? { ...saved, aiSummary: live?.aiSummary || saved.aiSummary }
              : { ...live, _id: live._id || saved?._id },
            saveStatus: unchanged ? "saved" : "unsaved",
            _saving: false,
            calendar: {
              ...prevCal,
              [payload.date]: {
                ...(prevCal[payload.date] || { noteCount: 0 }),
                mood: payload.mood,
                title: payload.title,
                hasContent: Boolean(payload.content.trim()),
              },
            },
          });
          // Derive tone/themes from what was just written, so the pattern
          // engine has an emotional signal for days with no mood set.
          // Fire-and-forget: the route is opt-in and returns a plain
          // "off" when journal analysis is disabled, so nothing here
          // needs to know or care which it is.
          if (payload.content.trim()) {
            fetch("/api/journal/extract", {
              method: "POST",
              headers: JSON_HEADERS,
              body: JSON.stringify({ date: payload.date, force: true }),
            }).catch(() => {});
          }

          if (!silent) toast.success("Saved");
          return true;
        } catch {
          set({ saveStatus: "error", _saving: false });
          if (!silent) {
            toast.error("Could not save — your writing is still here, try again.");
          }
          return false;
        }
      },

      /** Silent save used by page-hide / unmount / day-change safety nets. */
      flushSave: async () => get().saveJournal({ silent: true }),

      setAiSummary: (aiSummary) => {
        const j = get().journal || emptyJournal(get().activeDate);
        set({ journal: { ...j, aiSummary } });
      },

      addNote: async (content, type = "note") => {
        // The day on screen is already correct — it was patched in place.
        // This marks the home briefing, which reads the journal, and the
        // day itself for its next open. See lib/screen-data.js.
        invalidateScreens("journal");

        const text = content.trim();
        if (!text) return;
        const date = get().activeDate;
        const tempId = `temp-${Date.now()}`;
        const optimistic = {
          _id: tempId,
          content: text,
          type,
          date,
          pinned: false,
          createdAt: new Date().toISOString(),
          isOptimistic: true,
        };
        set({
          notes: [...get().notes, optimistic],
          notesTotal: get().notesTotal + 1,
        });

        try {
          const res = await fetch("/api/journal/notes", {
            method: "POST",
            headers: JSON_HEADERS,
            body: JSON.stringify({ date, content: text, type }),
          });
          if (!res.ok) throw new Error();
          const saved = await res.json();
          set({
            notes: get().notes.map((n) => (n._id === tempId ? saved : n)),
          });

          const cal = get().calendar;
          const day = cal[date] || {
            mood: null,
            title: "",
            hasContent: false,
            noteCount: 0,
          };
          set({
            calendar: {
              ...cal,
              [date]: { ...day, noteCount: (day.noteCount || 0) + 1 },
            },
          });
        } catch {
          set({
            notes: get().notes.filter((n) => n._id !== tempId),
            notesTotal: Math.max(get().notesTotal - 1, 0),
          });
          toast.error("Could not save note — please try again.");
        }
      },

      updateNote: async (id, patch) => {
        // The day on screen is already correct — it was patched in place.
        // This marks the home briefing, which reads the journal, and the
        // day itself for its next open. See lib/screen-data.js.
        invalidateScreens("journal");

        const before = get().notes;
        set({
          notes: before.map((n) => (n._id === id ? { ...n, ...patch } : n)),
        });
        try {
          const res = await fetch(`/api/journal/notes/${id}`, {
            method: "PATCH",
            headers: JSON_HEADERS,
            body: JSON.stringify(patch),
          });
          if (!res.ok) throw new Error();
        } catch {
          set({ notes: before });
          toast.error("Could not update note.");
        }
      },

      togglePin: async (id) => {
        // The day on screen is already correct — it was patched in place.
        // This marks the home briefing, which reads the journal, and the
        // day itself for its next open. See lib/screen-data.js.
        invalidateScreens("journal");

        const note = get().notes.find((n) => n._id === id);
        if (note) await get().updateNote(id, { pinned: !note.pinned });
      },

      deleteNote: async (id) => {
        // The day on screen is already correct — it was patched in place.
        // This marks the home briefing, which reads the journal, and the
        // day itself for its next open. See lib/screen-data.js.
        invalidateScreens("journal");

        const before = get().notes;
        const note = before.find((n) => n._id === id);
        if (!note) return;
        set({
          notes: before.filter((n) => n._id !== id),
          notesTotal: Math.max(get().notesTotal - 1, 0),
        });
        try {
          const res = await fetch(`/api/journal/notes/${id}`, {
            method: "DELETE",
          });
          if (!res.ok) throw new Error();
          const date = get().activeDate;
          const cal = get().calendar;
          if (cal[date]) {
            set({
              calendar: {
                ...cal,
                [date]: {
                  ...cal[date],
                  noteCount: Math.max((cal[date].noteCount || 1) - 1, 0),
                },
              },
            });
          }
          toast("Note deleted.", {
            action: { label: "Undo", onClick: () => get().undoNote(id) },
          });
        } catch {
          set({ notes: before, notesTotal: get().notesTotal + 1 });
          toast.error("Could not delete that note — it's still here.");
        }
      },

      /** Restore a soft-deleted note (the delete toast's Undo action). */
      undoNote: async (id) => {
        // The day on screen is already correct — it was patched in place.
        // This marks the home briefing, which reads the journal, and the
        // day itself for its next open. See lib/screen-data.js.
        invalidateScreens("journal");

        try {
          const res = await fetch(`/api/journal/notes/${id}/undo`, {
            method: "POST",
          });
          if (!res.ok) throw new Error();
          const note = await res.json();
          // Only rejoins the visible list if we're still on its day.
          if (note.date === get().activeDate) {
            const notes = [...get().notes, note].sort(
              (a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0)
            );
            set({ notes, notesTotal: get().notesTotal + 1 });
            const cal = get().calendar;
            const day = cal[note.date];
            if (day) {
              set({
                calendar: {
                  ...cal,
                  [note.date]: { ...day, noteCount: (day.noteCount || 0) + 1 },
                },
              });
            }
          }
          toast.success("Note restored.");
        } catch {
          toast.error("Could not restore that note.");
        }
      },
    }),
    {
      /**
       * `pos-` prefixed so `signOutEverywhere` clears it.
       *
       * Under the old name this survived sign-out: a journal — the most
       * personal thing in the app — stayed readable in localStorage for
       * whoever picked up a shared laptop next. It matters more now that the
       * screen paints from this rather than from server-rendered HTML.
       * `migrateLegacyKey` carries an unsaved draft across the rename once.
       */
      name: "pos-journal-store",
      partialize: (state) => ({
        activeDate: state.activeDate,
        journal: state.journal,
        notes: state.notes,
        notesTotal: state.notesTotal,
        notesHasMore: state.notesHasMore,
        calendar: state.calendar,
        saveStatus: state.saveStatus,
      }),
    }
  )
);
