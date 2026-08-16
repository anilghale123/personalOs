import { formatMoney } from "@/lib/money";

/** Always-visible running total for whatever period/filters are active. */
export function RunningTotalBar({ totalPaisa, count, label = "Total" }) {
  return (
    <div className="sticky bottom-3 z-10 flex items-center justify-between rounded-xl border bg-card/95 px-4 py-3 shadow-sm backdrop-blur">
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
  );
}
