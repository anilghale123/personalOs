"use client";

import { AlertTriangle, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { budgetStatus } from "../utils";

const TONE = {
  warning:
    "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200",
  over: "border-destructive/40 bg-destructive/10 text-destructive dark:text-red-300",
};

/**
 * The over-budget warning. Rendered wherever the user is spending —
 * the Expenses tab as well as the Budget tab — so going over is
 * impossible to miss without being a blocking dialog.
 *
 * Renders nothing while spending is comfortably inside the limit.
 *
 * @param {object} props
 * @param {number} props.spentPaisa
 * @param {number} props.budgetPaisa
 * @param {string} [props.label] what the budget covers, e.g. "Groceries"
 * @param {string} [props.periodLabel] e.g. "this month"
 */
export function BudgetAlert({ spentPaisa, budgetPaisa, label, periodLabel, className }) {
  const status = budgetStatus(spentPaisa, budgetPaisa);
  if (status.level !== "warning" && status.level !== "over") return null;

  const over = status.level === "over";
  const Icon = over ? AlertTriangle : TrendingUp;
  const scope = label ? `Your ${label} budget` : "Your budget";
  const when = periodLabel ? ` ${periodLabel}` : "";

  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm",
        TONE[status.level],
        className
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {over
            ? `Over budget by ${formatMoney(status.overPaisa)}`
            : `${Math.round(status.ratio * 100)}% of budget used`}
        </p>
        <p className="mt-0.5 opacity-90">
          {over
            ? `${scope}${when} was ${formatMoney(budgetPaisa)} and you have spent ${formatMoney(spentPaisa)}.`
            : `${formatMoney(status.remainingPaisa)} left of ${formatMoney(budgetPaisa)}${when}. Ease off to stay inside it.`}
        </p>
      </div>
    </div>
  );
}
