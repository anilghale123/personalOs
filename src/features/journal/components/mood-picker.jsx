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
  amazing: "bg-emerald-400",
  good: "bg-lime-400",
  okay: "bg-amber-400",
  bad: "bg-orange-400",
  awful: "bg-rose-400",
};

/** Soft mood tints — used to colour calendar day cells. */
export const MOOD_TINT = {
  amazing: "bg-emerald-400/25",
  good: "bg-lime-400/25",
  okay: "bg-amber-400/25",
  bad: "bg-orange-400/30",
  awful: "bg-rose-400/30",
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
export function MoodPicker({ value, onChange, variant = "default" }) {
  const isPaper = variant === "paper";

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
              "flex min-h-[44px] items-center gap-1.5 rounded-full px-2.5 text-sm transition-all sm:px-3",
              !isPaper && "border",
              isPaper
                ? active
                  ? "bg-[#e6d4ad]/50 text-[#3d2914] opacity-100"
                  : "text-[#6b5344] opacity-60 hover:opacity-90"
                : active
                  ? "border-foreground/25 bg-accent scale-[1.03]"
                  : "border-transparent opacity-55 hover:bg-accent/60 hover:opacity-100"
            )}
          >
            <span className="text-lg leading-none sm:text-base">{m.emoji}</span>
            <span
              className={cn(
                "hidden text-xs sm:inline",
                !isPaper && (active ? "font-medium" : "text-muted-foreground"),
                isPaper && "text-inherit",
                active && "font-medium"
              )}
            >
              {m.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
