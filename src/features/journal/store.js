import { create } from "zustand";
import { toast } from "sonner";
import { toDateKey } from "@/lib/utils";

const JSON_HEADERS = { "Content-Type": "application/json" };

/** Empty anchor-journal draft for a day with no entry yet. */
function emptyJournal(date) {
  return { date, mood: null, title: "", content: "", tags: [], aiSummary: "" };
}

/**
 * Journal store — orchestrates the daily anchor journal and quick notes.
 * The anchor journal autosaves on a debounce; quick notes are created
 * and mutated optimistically with rollback on failure.
 */
export const useJournalStore = create((set, get) => ({
  activeDate: toDateKey(),
  journal: null, // DailyJournal for activeDate (or null)
  notes: [], // QuickNotes for activeDate
  calendar: {}, // { 'YYYY-MM-DD': { mood, hasContent, noteCount, title } }
  recents: [],
  saveStatus: "saved", // 'saved' | 'saving' | 'error'
  loadingDay: false,
  _saveTimer: null,

  /** Seed the store with server-rendered data for the initial day. */
  hydrate: ({ date, journal, notes, calendar, recents }) =>
    set({
      activeDate: date,
      journal,
      notes: notes || [],
      calendar: calendar || {},
      recents: recents || [],
      saveStatus: "saved",
    }),

  /** Merge a freshly-fetched month into the calendar map. */
  mergeCalendar: (map) =>
    set({ calendar: { ...get().calendar, ...map } }),

  /** Switch the active day, flushing any pending save first. */
  selectDate: async (date) => {
    if (date === get().activeDate) return;
    await get().flushSave();
    set({ activeDate: date, loadingDay: true });
    try {
      const res = await fetch(`/api/journal?date=${date}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      set({
        journal: data.journal,
        notes: data.notes || [],
        loadingDay: false,
        saveStatus: "saved",
      });
    } catch {
      set({ loadingDay: false });
      toast.error("Could not load that day.");
    }
  },

  /** Optimistic local edit of the anchor journal + debounced autosave. */
  updateJournal: (patch) => {
    const date = get().activeDate;
    const current = get().journal || emptyJournal(date);
    set({ journal: { ...current, ...patch }, saveStatus: "saving" });

    clearTimeout(get()._saveTimer);
    const timer = setTimeout(() => get().flushSave(), 1100);
    set({ _saveTimer: timer });
  },

  /** Persist the current anchor journal if there are unsaved edits. */
  flushSave: async () => {
    clearTimeout(get()._saveTimer);
    const j = get().journal;
    if (!j || get().saveStatus !== "saving") return;
    try {
      const res = await fetch("/api/journal", {
        method: "PUT",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          date: j.date,
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
      // Retry shortly so a transient failure self-heals.
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

  /** Capture a quick note instantly, with optimistic insert. */
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
    set({ notes: [...get().notes, optimistic] });

    try {
      const res = await fetch("/api/journal/notes", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ date, content: text, type }),
      });
      if (!res.ok) throw new Error();
      const saved = await res.json();
      set({ notes: get().notes.map((n) => (n._id === tempId ? saved : n)) });

      // Reflect the new note in the calendar.
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
      set({ notes: get().notes.filter((n) => n._id !== tempId) });
      toast.error("Could not save note — please try again.");
    }
  },

  /** Optimistically edit a note's content or type. */
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
      set({ notes: before }); // rollback
      toast.error("Could not update note.");
    }
  },

  /** Optimistically toggle a note's pin. */
  togglePin: async (id) => {
    const note = get().notes.find((n) => n._id === id);
    if (note) await get().updateNote(id, { pinned: !note.pinned });
  },

  /** Optimistically delete a note. */
  deleteNote: async (id) => {
    const before = get().notes;
    set({ notes: before.filter((n) => n._id !== id) });
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
      set({ notes: before }); // rollback
      toast.error("Could not delete note.");
    }
  },
}));
