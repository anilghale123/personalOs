"use client";

import { cn } from "@/lib/utils";

export const MOODS = [
  { key: "amazing", emoji: "🤩", label: "Amazing" },
  { key: "good", emoji: "🙂", label: "Good" },
  { key: "okay", emoji: "😐", label: "Okay" },
  { key: "bad", emoji: "🙁", label: "Bad" },
  { key: "awful", emoji: "😣", label: "Awful" },
];

/** Solid mood colours — used for calendar dots and legends. */
export const MOOD_DOT = {
  amazing: "bg-sage-600",
  good: "bg-lime-400",
  okay: "bg-sand-500",
  bad: "bg-orange-400",
  awful: "bg-clay-600",
};

/** Soft mood tints — used to colour calendar day cells. */
export const MOOD_TINT = {
  amazing: "bg-sage-400/40",
  good: "bg-lime-400/25",
  okay: "bg-sand-400/40",
  bad: "bg-orange-400/30",
  awful: "bg-clay-600/30",
};

export function moodLabel(key) {
  return MOODS.find((m) => m.key === key)?.label || "";
}

/**
 * Calm, low-pressure mood selector. Clicking the active mood clears it.
 *
 * @param {object} props
 * @param {string|null} props.value
 * @param {(mood: string|null) => void} props.onChange
 */
export function MoodPicker({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5 sm:gap-2">
      {MOODS.map((m) => {
        const active = value === m.key;
        return (
          <button
            key={m.key}
            type="button"
            title={m.label}
            onClick={() => onChange(active ? null : m.key)}
            className={cn(
              "flex min-h-[36px] items-center gap-1.5 rounded-md border px-2.5 text-sm transition-colors",
              active
                ? "border-foreground/20 bg-accent"
                : "border-transparent text-muted-foreground hover:bg-sand-200/60 hover:text-foreground"
            )}
          >
            <span className="text-base leading-none">{m.emoji}</span>
            <span className={cn("hidden text-xs sm:inline", active && "font-medium")}>
              {m.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
