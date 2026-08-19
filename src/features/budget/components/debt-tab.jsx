"use client";

import * as React from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  HandCoins,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn, formatDate } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { StatCard } from "@/components/stat-card";
import { useBudgetStore } from "../store";
import { debtTotals } from "../utils";
import { DebtDialog } from "./debt-dialog";
import { DebtEntryDialog } from "./debt-entry-dialog";

/** The repayment ledger for one debt, collapsed until asked for. */
function DebtLedger({ debt }) {
  const deleteDebtEntry = useBudgetStore((s) => s.deleteDebtEntry);
  const entries = React.useMemo(
    () =>
      [...(debt.entries || [])].sort(
        (a, b) => (b.date || "").localeCompare(a.date || "")
      ),
    [debt.entries]
  );

  if (entries.length === 0) {
    return (
      <p className="px-4 py-3 text-xs text-muted-foreground">
        Nothing recorded yet.
      </p>
    );
  }

  async function remove(entryId) {
    try {
      await deleteDebtEntry(debt._id, entryId);
      toast.success("Entry removed.");
    } catch (err) {
      toast.error(err.message || "Could not remove the entry.");
    }
  }

  return (
    <div className="divide-y border-t">
      {entries.map((entry) => {
        const isPayment = entry.type === "payment";
        return (
          <div
            key={entry._id}
            className="group flex items-center justify-between gap-3 px-4 py-2 text-sm"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                  isPayment
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                )}
                aria-hidden="true"
              >
                {isPayment ? (
                  <ArrowDownLeft className="h-3.5 w-3.5" />
                ) : (
                  <ArrowUpRight className="h-3.5 w-3.5" />
                )}
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">
                  {isPayment ? "Payment" : "Extra borrowed"}
                </p>
                {entry.note && (
                  <p className="truncate text-xs text-muted-foreground">
                    {entry.note}
                  </p>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {formatDate(entry.date)}
              </span>
              <span className="tabular-nums text-sm font-medium">
                {isPayment ? "−" : "+"}
                {formatMoney(entry.amountPaisa)}
              </span>
              <button
                onClick={() => remove(entry._id)}
                aria-label="Remove entry"
                className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DebtCard({ debt, onEdit, onRecord }) {
  const deleteDebt = useBudgetStore((s) => s.deleteDebt);
  const updateDebt = useBudgetStore((s) => s.updateDebt);
  const [open, setOpen] = React.useState(false);

  const totals = debtTotals(debt);
  const owed = debt.kind === "owe";
  const cleared = totals.isCleared || debt.status === "closed";

  async function remove() {
    try {
      await deleteDebt(debt._id);
      toast.success("Debt removed.");
    } catch {
      toast.error("Could not remove the debt.");
    }
  }

  async function toggleStatus() {
    try {
      await updateDebt(debt._id, {
        status: debt.status === "closed" ? "active" : "closed",
      });
      toast.success(debt.status === "closed" ? "Debt reopened." : "Debt closed.");
    } catch (err) {
      toast.error(err.message || "Could not update the debt.");
    }
  }

  return (
    <div
      className={cn(
        "rounded-xl border bg-card",
        debt.status === "closed" && "opacity-70"
      )}
    >
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate font-medium">{debt.name}</h3>
              <Badge variant={owed ? "warning" : "secondary"}>
                {owed ? "I owe" : "Owed to me"}
              </Badge>
              {cleared && (
                <Badge variant="success" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Cleared
                </Badge>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {[
                debt.counterparty,
                debt.dueDate ? `due ${formatDate(debt.dueDate)}` : null,
                debt.interestRate ? `${debt.interestRate}% a year` : null,
              ]
                .filter(Boolean)
                .join(" · ") || "No lender or due date set"}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            <button
              onClick={toggleStatus}
              aria-label={debt.status === "closed" ? "Reopen debt" : "Close debt"}
              title={debt.status === "closed" ? "Reopen debt" : "Mark as closed"}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onEdit(debt)}
              aria-label="Edit debt"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={remove}
              aria-label="Delete debt"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="flex items-baseline justify-between gap-3">
          <p className="text-2xl font-semibold tabular-nums">
            {formatMoney(totals.remainingPaisa)}
            <span className="ml-1.5 text-sm font-normal text-muted-foreground">
              left
            </span>
          </p>
          <p className="text-xs tabular-nums text-muted-foreground">
            {formatMoney(totals.paidPaisa)} paid of {formatMoney(totals.totalPaisa)}
          </p>
        </div>

        <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              totals.isCleared ? "bg-emerald-500" : "bg-primary"
            )}
            style={{ width: `${totals.progress}%` }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => onRecord(debt, "payment")}>
            <Plus className="h-3.5 w-3.5" />
            {owed ? "Record payment" : "Record repayment"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onRecord(debt, "borrow")}
          >
            {owed ? "Borrowed more" : "Lent more"}
          </Button>
          <button
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {open ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
            History ({(debt.entries || []).length})
          </button>
        </div>
      </div>

      {open && <DebtLedger debt={debt} />}
    </div>
  );
}

/** Debt tab — what you owe, what you have paid off, and what is left. */
export function DebtTab() {
  const debts = useBudgetStore((s) => s.debts);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState(null);
  const [entryFor, setEntryFor] = React.useState(null);
  const [entryType, setEntryType] = React.useState("payment");

  const totals = React.useMemo(() => {
    let owedPaisa = 0;
    let lentPaisa = 0;
    let paidPaisa = 0;
    for (const debt of debts) {
      if (debt.status === "closed") continue;
      const t = debtTotals(debt);
      paidPaisa += t.paidPaisa;
      if (debt.kind === "owe") owedPaisa += t.remainingPaisa;
      else lentPaisa += t.remainingPaisa;
    }
    return { owedPaisa, lentPaisa, paidPaisa };
  }, [debts]);

  function openAdd() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(debt) {
    setEditing(debt);
    setFormOpen(true);
  }

  function openEntry(debt, type) {
    setEntryFor(debt);
    setEntryType(type);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Debts</h2>
          <p className="text-sm text-muted-foreground">
            Track what you owe, what you have paid, and what is still left.
          </p>
        </div>
        <Button size="sm" onClick={openAdd}>
          <Plus className="h-4 w-4" />
          Add debt
        </Button>
      </div>

      {debts.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard
            label="You owe"
            value={formatMoney(totals.owedPaisa)}
            hint="Outstanding across open debts"
            icon={ArrowUpRight}
            tone={totals.owedPaisa > 0 ? "negative" : "default"}
          />
          <StatCard
            label="Owed to you"
            value={formatMoney(totals.lentPaisa)}
            hint="Money you expect back"
            icon={ArrowDownLeft}
          />
          <StatCard
            label="Paid off"
            value={formatMoney(totals.paidPaisa)}
            hint="Total repaid so far"
            icon={CheckCircle2}
            tone="positive"
          />
        </div>
      )}

      {debts.length === 0 ? (
        <EmptyState
          icon={HandCoins}
          title="No debts tracked"
          description="Add a loan or an IOU and log each repayment — the balance updates itself."
        >
          <Button size="sm" onClick={openAdd}>
            <Plus className="h-4 w-4" />
            Add debt
          </Button>
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {debts.map((debt) => (
            <DebtCard
              key={debt._id}
              debt={debt}
              onEdit={openEdit}
              onRecord={openEntry}
            />
          ))}
        </div>
      )}

      <DebtDialog open={formOpen} onOpenChange={setFormOpen} debt={editing} />
      <DebtEntryDialog
        open={Boolean(entryFor)}
        onOpenChange={(open) => !open && setEntryFor(null)}
        debt={entryFor}
        defaultType={entryType}
      />
    </div>
  );
}
