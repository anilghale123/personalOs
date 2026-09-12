"use client";

import * as React from "react";
import { ChevronDown, Filter, Loader2, Repeat } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { formatBsDate } from "@/lib/nepali-date";
import { useBudgetStore } from "../store";
import { PAYMENT_METHODS } from "../constants";

const PAYMENT_LABELS = Object.fromEntries(
  PAYMENT_METHODS.map((p) => [p.id, p.label])
);

/**
 * One category in the breakdown, expandable to the expenses behind it.
 *
 * The total alone answers "where did the money go"; it does not answer "on
 * what", which is the next question every time. Opening the row shows the
 * individual entries — note, date, payment method, amount — so the figure can
 * be checked against memory without leaving the panel.
 *
 * Tapping the row toggles it open and closed. Filtering the main list to this
 * category is a **separate** control inside the open row: making one tap do
 * both meant you could not inspect a category without also narrowing the list
 * you were inspecting it against.
 */
export function CategoryBreakdownRow({
  row,
  sharePercent,
  isOpen,
  onToggle,
  isFiltered,
  onFilter,
  filters,
  cal,
}) {
  const loadCategoryExpenses = useBudgetStore((s) => s.loadCategoryExpenses);

  const [detail, setDetail] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  const detailId = `breakdown-detail-${row.id || "uncategorised"}`;

  /**
   * Fetch only while open, and only for a real category.
   *
   * An "uncategorised" bucket has no id to query by — it should not exist
   * (the schema requires a category) but the breakdown handles a null id
   * defensively, so this does too rather than sending `categoryId=`.
   */
  React.useEffect(() => {
    if (!isOpen || !row.id) return undefined;

    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError("");
      try {
        const result = await loadCategoryExpenses(row.id, filters, {
          signal: controller.signal,
        });
        if (!cancelled) setDetail(result);
      } catch {
        if (!cancelled && !controller.signal.aborted) {
          setError("Couldn't load these expenses.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isOpen, row.id, filters, loadCategoryExpenses]);

  const expandable = Boolean(row.id);

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        disabled={!expandable}
        aria-expanded={expandable ? isOpen : undefined}
        aria-controls={expandable ? detailId : undefined}
        className={cn(
          "relative flex min-h-[48px] w-full items-center gap-2 px-4 py-2 text-left transition-colors",
          isOpen ? "bg-muted/50" : "active:bg-accent",
          !expandable && "cursor-default"
        )}
      >
        {/* Share-of-spend bar, sitting behind the label */}
        <span
          aria-hidden
          className="absolute inset-y-1 left-1 rounded-md bg-primary/10"
          style={{ width: `${Math.max(sharePercent, 2)}%` }}
        />
        <span className="relative flex min-w-0 flex-1 items-center gap-2">
          <span aria-hidden className="text-base">
            {row.category?.icon || "📦"}
          </span>
          <span className="truncate text-sm">
            {row.category?.name || "Uncategorised"}
          </span>
          {/* The count earns its place: it distinguishes one big purchase
              from thirty small ones at the same total. */}
          {row.count > 0 && (
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              ×{row.count}
            </span>
          )}
        </span>
        <span className="relative shrink-0 text-sm font-medium tabular-nums">
          {formatMoney(row.totalPaisa)}
        </span>
        {expandable && (
          <ChevronDown
            aria-hidden
            className={cn(
              "relative h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              isOpen && "rotate-180"
            )}
          />
        )}
      </button>

      {isOpen && expandable && (
        <div id={detailId} className="border-t bg-muted/20 px-3 py-2">
          {loading && !detail ? (
            <p className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading expenses…
            </p>
          ) : error ? (
            <p className="py-4 text-center text-sm text-destructive">{error}</p>
          ) : !detail?.expenses?.length ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No individual expenses in this range.
            </p>
          ) : (
            <>
              <ul className="divide-y divide-border/60">
                {detail.expenses.map((expense) => (
                  <li
                    key={expense._id}
                    className="flex items-start gap-2 py-2 pl-1 pr-1"
                  >
                    <div className="min-w-0 flex-1">
                      {/* The note is the point of opening this, so it leads —
                          and when there is no note the date takes its place
                          rather than leaving an empty line. */}
                      <p className="flex items-center gap-1.5 truncate text-sm">
                        {expense.note || (
                          <span className="text-muted-foreground">
                            No note
                          </span>
                        )}
                        {expense.isRecurring && (
                          <Repeat
                            className="h-3 w-3 shrink-0 text-muted-foreground"
                            aria-label="Recurring"
                          />
                        )}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {[
                          cal === "np"
                            ? formatBsDate(expense.date)
                            : formatDate(expense.date),
                          PAYMENT_LABELS[expense.paymentMethod],
                          ...(expense.tags ?? []).slice(0, 2),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <span className="shrink-0 pt-0.5 text-sm font-medium tabular-nums">
                      {formatMoney(expense.amountPaisa)}
                    </span>
                  </li>
                ))}
              </ul>

              {/* Says so when the list is truncated, rather than letting the
                  visible rows quietly fail to add up to the total above. */}
              {detail.count > detail.expenses.length && (
                <p className="pt-2 text-center text-xs text-muted-foreground tabular-nums">
                  Showing the {detail.expenses.length} largest of{" "}
                  {detail.count}
                </p>
              )}

              <button
                type="button"
                onClick={onFilter}
                className={cn(
                  "mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
                  isFiltered
                    ? "bg-primary/15 text-primary"
                    : "bg-background text-muted-foreground hover:text-foreground"
                )}
              >
                <Filter className="h-3.5 w-3.5" />
                {isFiltered
                  ? "Showing only this category — tap to clear"
                  : "Show only this category in the list"}
              </button>
            </>
          )}
        </div>
      )}
    </li>
  );
}
