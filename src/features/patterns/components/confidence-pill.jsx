import { cn } from "@/lib/utils";
import { confidenceDots, confidenceLabel } from "../feed";

/**
 * Confidence, in plain language and filled dots.
 *
 * Never a p-value and never an effect size — those are available behind a
 * disclosure on the detail page for anyone curious, but a card that says
 * "p = 0.008" is asking the reader to do statistics, and the whole point
 * is that the product already did them.
 *
 * Confidence rises only through repeated confirmation over time, so
 * "seen consistently over 6 weeks" is a literal description of why the
 * band is what it is, not a euphemism for a number.
 */
export function ConfidencePill({ insight, className, showLabel = true }) {
  const filled = confidenceDots(insight?.confidence);
  const label = confidenceLabel(insight);

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="flex items-center gap-0.5" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              i < filled ? "bg-brand" : "bg-muted-foreground/25"
            )}
          />
        ))}
      </span>
      {showLabel && (
        <span className="text-xs text-muted-foreground">{label}</span>
      )}
      <span className="sr-only">
        {insight?.confidence} confidence — {label}
      </span>
    </span>
  );
}
