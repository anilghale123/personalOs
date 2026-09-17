import { formatMoney } from "@/lib/money";

/**
 * Always-visible running total for whatever period/filters are active.
 *
 * On phones this is pinned above the bottom tab bar rather than left at
 * the end of the list — the total is the reason most people open this
 * screen, and scrolling a month of expenses to reach it made it useless.
 * From `md` up the sidebar layout has no tab bar to clear, so it goes
 * back to sticking to the bottom of the scroll area.
 */
export function RunningTotalBar({ totalPaisa, count, label = "Total" }) {
  return (
    <>
      {/* Reserves the space the fixed bar covers on phones. */}
      <div aria-hidden="true" className="h-[76px] md:hidden" />

      <div
        className="fixed inset-x-4 bottom-[calc(4.375rem+max(22px,env(safe-area-inset-bottom)))] z-30 flex items-center justify-between rounded-2xl border border-border bg-card/95 px-4 py-3 shadow-lg backdrop-blur md:sticky md:inset-x-auto md:bottom-3 md:border-0 md:shadow-sm"
      >
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="text-xl font-semibold tabular-nums">{formatMoney(totalPaisa)}</p>
        </div>
        <p className="text-xs text-muted-foreground">
          {count} {count === 1 ? "expense" : "expenses"}
        </p>
      </div>
    </>
  );
}
