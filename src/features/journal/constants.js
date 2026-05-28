export const NOTE_TYPES = [
  { key: "note", label: "Note", emoji: "📝" },
  { key: "idea", label: "Idea", emoji: "💡" },
  { key: "task", label: "Task", emoji: "✅" },
  { key: "gratitude", label: "Gratitude", emoji: "🙏" },
];

export const NOTE_PAGE_SIZE = 50;

export function noteTypeLabel(key) {
  return NOTE_TYPES.find((t) => t.key === key)?.label || "Note";
}

export function noteTypeEmoji(key) {
  return NOTE_TYPES.find((t) => t.key === key)?.emoji || "📝";
}
