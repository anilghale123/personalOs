"use client";

import { cn } from "@/lib/utils";
import { pickableCategories } from "../utils";

/**
 * Grid of category chips for the fast add-expense flow. Archived
 * categories never appear here — they're historical-only.
 */
export function CategoryPicker({ categories, value, onChange }) {
  const options = pickableCategories(categories);

  if (options.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No categories yet — add one in the Categories tab first.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Category">
      {options.map((c) => {
        const active = value === c._id;
        return (
          <button
            key={c._id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(c._id)}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "border-primary bg-primary/10 text-primary"
                : "border-input text-foreground hover:bg-accent"
            )}
          >
            <span aria-hidden="true">{c.icon}</span>
            {c.name}
          </button>
        );
      })}
    </div>
  );
}
