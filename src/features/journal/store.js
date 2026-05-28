import { create } from "zustand";
import { persist } from "zustand/middleware";
import { toast } from "sonner";
import { toDateKey } from "@/lib/utils";
import { NOTE_PAGE_SIZE } from "@/features/journal/constants";

const JSON_HEADERS = { "Content-Type": "application/json" };

/** Empty anchor-journal draft for a day with no entry yet. */
function emptyJournal(date) {
  return { date, mood: null, title: "", content: "", tags: [], aiSummary: "" };
}

/**
 * Journal store — orchestrates the daily anchor journal and quick notes.
 * The anchor journal autosaves on a debounce; quick notes are created
 * and mutated optimistically with rollback on failure.
 * Draft state persists to localStorage for instant recovery.
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
      saveStatus: "saved",
      loadingDay: false,
      loadingMoreNotes: false,
      _saveTimer: null,

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
          saveStatus: hasLocalDraft ? local.saveStatus : "saved",
        });

        if (hasLocalDraft && local.saveStatus !== "saved") {
          setTimeout(() => get().flushSave(), 600);
        }
      },

      mergeCalendar: (map) =>
        set({ calendar: { ...get().calendar, ...map } }),

      selectDate: async (date) => {
        if (date === get().activeDate) return;
        await get().flushSave();
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

      updateJournal: (patch) => {
        const date = get().activeDate;
        const current = get().journal || emptyJournal(date);
        set({ journal: { ...current, ...patch }, saveStatus: "saving" });

        clearTimeout(get()._saveTimer);
        const timer = setTimeout(() => get().flushSave(), 1100);
        set({ _saveTimer: timer });
      },

      flushSave: async () => {
        clearTimeout(get()._saveTimer);
        const j = get().journal;
        if (!j || get().saveStatus !== "saving") return;
        try {
          const res = await fetch("/api/journal", {
            method: "PUT",
            headers: JSON_HEADERS,
            body: JSON.stringify({
              date: j.date || get().activeDate,
              mood: j.mood,
              title: j.title,
              content: j.content,
              tags: j.tags,
            }),
          });
          if (!res.ok) throw new Error();
          const saved = await res.json();
          const prevCal = get().calendar;
          set({
            journal: saved,
            saveStatus: "saved",
            calendar: {
              ...prevCal,
              [saved.date]: {
                ...(prevCal[saved.date] || { noteCount: 0 }),
                mood: saved.mood || null,
                title: saved.title || "",
                hasContent: Boolean(saved.content && saved.content.trim()),
              },
            },
          });
        } catch {
          set({ saveStatus: "error" });
          toast.error("Autosave failed — your text is still here, retrying soon.");
          const timer = setTimeout(() => {
            set({ saveStatus: "saving" });
            get().flushSave();
          }, 4000);
          set({ _saveTimer: timer });
        }
      },

      setAiSummary: (aiSummary) => {
        const j = get().journal || emptyJournal(get().activeDate);
        set({ journal: { ...j, aiSummary } });
      },

      addNote: async (content, type = "note") => {
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
        const note = get().notes.find((n) => n._id === id);
        if (note) await get().updateNote(id, { pinned: !note.pinned });
      },

      deleteNote: async (id) => {
        const before = get().notes;
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
        } catch {
          set({ notes: before, notesTotal: get().notesTotal + 1 });
          toast.error("Could not delete note.");
        }
      },
    }),
    {
      name: "journal-store",
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
