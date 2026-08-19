"use client";

import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { budgetStatus } from "../utils";

const BAR_TONE = {
  ok: "bg-emerald-500",
  warning: "bg-amber-500",
  over: "bg-destructive",
  none: "bg-muted-foreground/30",
};

const TEXT_TONE = {
  ok: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  over: "text-destructive",
  none: "text-muted-foreground",
};

/**
 * Spend-against-limit bar. The fill is capped at 100% but the label
 * keeps counting past it, so an overspend reads as a number rather
 * than a bar that quietly stops growing.
 */
export function BudgetMeter({ spentPaisa, budgetPaisa, size = "default", className }) {
  const status = budgetStatus(spentPaisa, budgetPaisa);
  const pct = Math.min(status.ratio * 100, 100);
  const large = size === "large";

  return (
    <div className={cn("space-y-1.5", className)}>
      <div
        className={cn(
          "w-full overflow-hidden rounded-full bg-secondary",
          large ? "h-2.5" : "h-1.5"
        )}
        role="progressbar"
        aria-valuenow={Math.round(status.ratio * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn("h-full rounded-full transition-all", BAR_TONE[status.level])}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="tabular-nums text-muted-foreground">
          {formatMoney(spentPaisa)} of {formatMoney(budgetPaisa)}
        </span>
        <span className={cn("font-medium tabular-nums", TEXT_TONE[status.level])}>
          {status.level === "over"
            ? `${formatMoney(status.overPaisa)} over`
            : `${formatMoney(status.remainingPaisa)} left`}
        </span>
      </div>
    </div>
  );
}
