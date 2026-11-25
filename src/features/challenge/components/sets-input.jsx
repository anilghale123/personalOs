"use client";

import * as React from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The sets editor for a tracker that counts by set — chips like
 * [10] [12] [10] plus an "+ Add set" button.
 *
 * "Add set" starts the new chip prefilled with the last set's value, because
 * the common move is another set of the same size, not a fresh number.
 * Tapping a chip focuses it for editing; its × removes it. The parent stores
 * the array; the sum is worked out where it matters (the API re-derives it).
 */
export function SetsInput({ value, onChange, disabled = false, unit }) {
  const sets = React.useMemo(
    () => (Array.isArray(value) ? value.map((n) => Number(n) || 0) : []),
    [value]
  );

  function setAt(i, num) {
    const next = sets.slice();
    next[i] = num;
    onChange(next);
  }
  function addSet() {
    const seed = sets.length ? sets[sets.length - 1] : 0;
    onChange([...sets, seed]);
  }
  function removeAt(i) {
    onChange(sets.filter((_, idx) => idx !== i));
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {sets.map((n, i) => (
        <div
          key={i}
          className="relative flex h-9 items-center gap-0.5 rounded-md border bg-background px-1"
        >
          <input
            type="text"
            inputMode="numeric"
            value={String(n)}
            disabled={disabled}
            aria-label={`Set ${i + 1}`}
            onChange={(e) => {
              const digits = e.target.value.replace(/[^\d]/g, "");
              setAt(i, digits === "" ? 0 : Number(digits));
            }}
            className="w-9 bg-transparent text-center text-sm tabular-nums outline-none"
          />
          {unit && (
            <span className="pr-1 text-[10px] text-muted-foreground">{unit}</span>
          )}
          {!disabled && (
            <button
              type="button"
              tabIndex={-1}
              onClick={() => removeAt(i)}
              aria-label={`Remove set ${i + 1}`}
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}
      {!disabled && (
        <button
          type="button"
          onClick={addSet}
          className={cn(
            "flex h-9 items-center gap-1 rounded-md border border-dashed px-2.5 text-xs font-medium",
            "text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          )}
        >
          <Plus className="h-3.5 w-3.5" />
          Add set
        </button>
      )}
      {sets.length === 0 && disabled && (
        <span className="text-xs text-muted-foreground">Not logged</span>
      )}
    </div>
  );
}
