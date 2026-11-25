/**
 * Shared vocabulary for the challenge feature — the things the API routes,
 * the builder and the logger all need to agree on.
 */

export const METRICS = [
  { id: "minutes", label: "Minutes" },
  { id: "count", label: "Count" },
  { id: "check", label: "Yes / No" },
];

export const METRIC_IDS = METRICS.map((m) => m.id);

export const METRIC_LABEL = Object.fromEntries(
  METRICS.map((m) => [m.id, m.label])
);

/**
 * The duration presets the builder offers. 30 / 66 / 75 / 88 cover the
 * classic reset lengths; anything else is "custom".
 */
export const DURATION_PRESETS = [
  { days: 30, label: "30 days" },
  { days: 66, label: "66 days" },
  { days: 75, label: "75 days" },
  { days: 88, label: "88 days" },
];

/** Challenge status values, in the order the UI lists them. */
export const STATUS = ["active", "completed", "abandoned"];

export const STATUS_LABEL = {
  active: "Active",
  completed: "Completed",
  abandoned: "Abandoned",
};

/** Same palette as WeeklyGoal. */
export const COLORS = ["blue", "green", "amber", "red", "purple", "pink"];

/** Tailwind classes for a challenge color — one per place a color is shown. */
export const COLOR_STYLES = {
  blue: {
    bar: "bg-blue-500",
    soft: "bg-blue-500/10",
    text: "text-blue-600",
    dot: "bg-blue-500",
  },
  green: {
    bar: "bg-green-500",
    soft: "bg-green-500/10",
    text: "text-green-600",
    dot: "bg-green-500",
  },
  amber: {
    bar: "bg-amber-500",
    soft: "bg-amber-500/10",
    text: "text-amber-600",
    dot: "bg-amber-500",
  },
  red: {
    bar: "bg-red-500",
    soft: "bg-red-500/10",
    text: "text-red-600",
    dot: "bg-red-500",
  },
  purple: {
    bar: "bg-purple-500",
    soft: "bg-purple-500/10",
    text: "text-purple-600",
    dot: "bg-purple-500",
  },
  pink: {
    bar: "bg-pink-500",
    soft: "bg-pink-500/10",
    text: "text-pink-600",
    dot: "bg-pink-500",
  },
};

/**
 * Pace status → pill styling. `not_enough_data` is not a colour, it is an
 * invitation: muted, not alarmed.
 */
export const PACE_STATUS = {
  on_track: { label: "On track", className: "bg-sage-200 text-sage-900" },
  close: { label: "Close", className: "bg-amber-200 text-amber-900" },
  behind: { label: "Behind", className: "bg-red-200 text-red-900" },
  not_enough_data: {
    label: "Gathering data",
    className: "bg-secondary text-secondary-foreground",
  },
};

/** The deepest a tracker tree may go (habit → item → variation). */
export const MAX_DEPTH = 3;
