"use client";

import * as React from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  PiggyBank,
  Pencil,
  Plus,
  Target,
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
import { goalTotals } from "../utils";
import { GoalDialog } from "./goal-dialog";
import { ContributionDialog } from "./contribution-dialog";

function ContributionList({ goal }) {
  const deleteContribution = useBudgetStore((s) => s.deleteContribution);
  const items = React.useMemo(
    () =>
      [...(goal.contributions || [])].sort((a, b) =>
        (b.date || "").localeCompare(a.date || "")
      ),
    [goal.contributions]
  );

  if (items.length === 0) {
    return (
      <p className="px-4 py-3 text-xs text-muted-foreground">
        Nothing saved towards this yet.
      </p>
    );
  }

  async function remove(entryId) {
    try {
      await deleteContribution(goal._id, entryId);
      toast.success("Contribution removed.");
    } catch (err) {
      toast.error(err.message || "Could not remove the contribution.");
    }
  }

  return (
    <div className="divide-y border-t">
      {items.map((entry) => (
        <div
          key={entry._id}
          className="group flex items-center justify-between gap-3 px-4 py-2 text-sm"
        >
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">
              {formatDate(entry.date)}
            </p>
            {entry.note && (
              <p className="truncate text-xs text-muted-foreground">
                {entry.note}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="tabular-nums font-medium">
              {formatMoney(entry.amountPaisa)}
            </span>
            <button
              onClick={() => remove(entry._id)}
              aria-label="Remove contribution"
              className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function GoalCard({ goal, onEdit, onContribute }) {
  const deleteFinancialGoal = useBudgetStore((s) => s.deleteFinancialGoal);
  const [open, setOpen] = React.useState(false);
  const totals = goalTotals(goal);

  async function remove() {
    try {
      await deleteFinancialGoal(goal._id);
      toast.success("Goal removed.");
    } catch {
      toast.error("Could not remove the goal.");
    }
  }

  return (
    <div className="rounded-xl border bg-card">
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xl"
              style={{ background: `${goal.color || "#16a34a"}1f` }}
              aria-hidden="true"
            >
              {goal.icon || "🎯"}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate font-medium">{goal.name}</h3>
                {totals.isAchieved && (
                  <Badge variant="success" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Reached
                  </Badge>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {goal.targetDate
                  ? `Target ${formatDate(goal.targetDate)}`
                  : "No target date"}
                {goal.note ? ` · ${goal.note}` : ""}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            <button
              onClick={() => onEdit(goal)}
              aria-label="Edit goal"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={remove}
              aria-label="Delete goal"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="flex items-baseline justify-between gap-3">
          <p className="text-2xl font-semibold tabular-nums">
            {formatMoney(totals.savedPaisa)}
            <span className="ml-1.5 text-sm font-normal text-muted-foreground">
              saved
            </span>
          </p>
          <p className="text-xs tabular-nums text-muted-foreground">
            {totals.isAchieved
              ? `Target ${formatMoney(totals.targetPaisa)} reached`
              : `${formatMoney(totals.remainingPaisa)} to go`}
          </p>
        </div>

        <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              totals.isAchieved ? "bg-emerald-500" : "bg-brand"
            )}
            style={{ width: `${totals.progress}%` }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => onContribute(goal)}>
            <Plus className="h-3.5 w-3.5" />
            Add savings
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
            History ({(goal.contributions || []).length})
          </button>
        </div>
      </div>

      {open && <ContributionList goal={goal} />}
    </div>
  );
}

/** Savings goals — what the money is for once it stops being spent. */
export function FinancialGoalsTab() {
  const goals = useBudgetStore((s) => s.financialGoals);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState(null);
  const [contributeTo, setContributeTo] = React.useState(null);

  const totals = React.useMemo(() => {
    let savedPaisa = 0;
    let targetPaisa = 0;
    let reached = 0;
    for (const goal of goals) {
      const t = goalTotals(goal);
      savedPaisa += t.savedPaisa;
      targetPaisa += t.targetPaisa;
      if (t.isAchieved) reached += 1;
    }
    return { savedPaisa, targetPaisa, reached };
  }, [goals]);

  function openAdd() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(goal) {
    setEditing(goal);
    setFormOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Savings goals</h2>
          <p className="text-sm text-muted-foreground">
            What the money you keep is actually for.
          </p>
        </div>
        <Button size="sm" onClick={openAdd}>
          <Plus className="h-4 w-4" />
          New goal
        </Button>
      </div>

      {goals.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard
            label="Total saved"
            value={formatMoney(totals.savedPaisa)}
            hint="Across every goal"
            icon={PiggyBank}
            tone="positive"
          />
          <StatCard
            label="Total target"
            value={formatMoney(totals.targetPaisa)}
            hint={`${goals.length} ${goals.length === 1 ? "goal" : "goals"}`}
            icon={Target}
          />
          <StatCard
            label="Reached"
            value={`${totals.reached} of ${goals.length}`}
            hint="Goals fully funded"
            icon={CheckCircle2}
          />
        </div>
      )}

      {goals.length === 0 ? (
        <EmptyState
          icon={PiggyBank}
          title="No savings goals yet"
          description="An emergency fund, a trip, a laptop — name it, set a target, and log what you put aside."
        >
          <Button size="sm" onClick={openAdd}>
            <Plus className="h-4 w-4" />
            New goal
          </Button>
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {goals.map((goal) => (
            <GoalCard
              key={goal._id}
              goal={goal}
              onEdit={openEdit}
              onContribute={setContributeTo}
            />
          ))}
        </div>
      )}

      <GoalDialog open={formOpen} onOpenChange={setFormOpen} goal={editing} />
      <ContributionDialog
        open={Boolean(contributeTo)}
        onOpenChange={(open) => !open && setContributeTo(null)}
        goal={contributeTo}
      />
    </div>
  );
}
