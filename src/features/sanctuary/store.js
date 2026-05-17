import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Sanctuary store — local-first journal. Edits are written to local
 * state instantly and flushed to the server on a 1.5s debounce.
 */
export const useSanctuaryStore = create(
  persist(
    (set, get) => ({
      entries: {}, // { 'YYYY-MM-DD': { content, mood, tags, isSynced } }
      activeDate: new Date().toISOString().split("T")[0],
      syncQueue: [], // Dates pending background sync
      _syncTimer: null,

      setActiveDate: (date) => set({ activeDate: date }),

      hydrateEntry: (date, entry) => {
        set({
          entries: {
            ...get().entries,
            [date]: { ...entry, isSynced: true },
          },
        });
      },

      // Instant local write — no waiting for DB
      updateEntry: (date, patch) => {
        const entries = get().entries;
        const current = entries[date] || {
          content: "",
          mood: null,
          tags: [],
        };
        const updated = { ...current, ...patch, isSynced: false };

        set({
          entries: { ...entries, [date]: updated },
          syncQueue: [...new Set([...get().syncQueue, date])],
        });

        // Debounced background sync (1.5s after last keystroke)
        clearTimeout(get()._syncTimer);
        const timer = setTimeout(() => get()._flushSync(date), 1500);
        set({ _syncTimer: timer });
      },

      _flushSync: async (date) => {
        const entry = get().entries[date];
        if (!entry || entry.isSynced) return;

        try {
          await fetch("/api/sanctuary/entries", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ date, ...entry }),
          });
          set({
            entries: {
              ...get().entries,
              [date]: { ...get().entries[date], isSynced: true },
            },
            syncQueue: get().syncQueue.filter((d) => d !== date),
          });
        } catch {
          // Entry stays in syncQueue; retry on next mount
        }
      },

      // Call on app mount to flush any unsynced entries from previous session
      flushAll: async () => {
        const queue = [...get().syncQueue];
        for (const date of queue) await get()._flushSync(date);
      },
    }),
    {
      name: "sanctuary-store",
      partialize: (state) => ({
        entries: state.entries,
        syncQueue: state.syncQueue,
      }),
    }
  )
);
