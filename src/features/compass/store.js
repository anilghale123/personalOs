import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Compass store — goals, habit logs and heatmap state.
 * Habit toggles are optimistic: the UI updates instantly and syncs
 * in the background, rolling back on failure.
 */
export const useCompassStore = create(
  persist(
    (set, get) => ({
      goals: [],
      habits: [], // distinct habit names the user tracks
      heatmapData: {}, // { 'YYYY-MM-DD': { [habitName]: boolean } }

      setGoals: (goals) => set({ goals }),
      setHabits: (habits) => set({ habits }),
      setHeatmapData: (heatmapData) => set({ heatmapData }),

      addHabit: (name) => {
        const habits = get().habits;
        if (!name || habits.includes(name)) return;
        set({ habits: [...habits, name] });
      },

      // Optimistic habit toggle — UI updates instantly
      toggleHabit: (habitName, dateStr, completed) => {
        const prev = get().heatmapData;
        set({
          heatmapData: {
            ...prev,
            [dateStr]: {
              ...(prev[dateStr] || {}),
              [habitName]: completed,
            },
          },
        });
        // Background sync
        fetch("/api/compass/habits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ habitName, date: dateStr, completed }),
        }).catch(() => {
          // Rollback on failure
          set({ heatmapData: prev });
        });
      },
    }),
    {
      name: "compass-store",
      partialize: (state) => ({
        heatmapData: state.heatmapData,
        habits: state.habits,
      }),
    }
  )
);
