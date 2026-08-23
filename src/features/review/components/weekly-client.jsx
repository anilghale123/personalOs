"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  MinusCircle,
  Sparkles,
  TrendingDown,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { CHECK_IN, CHECK_IN_LABEL } from "@/features/patterns/weekly";
import { ConfidencePill } from "@/features/patterns/components/confidence-pill";

/**
 * Weekly Discoveries.
 *
 * The old weekly review asked the user to grade themselves out of five on
 * each goal. This asks a different question: what did the last seven days
 * teach you, and did what you learned before still hold? The per-goal star
 * rating is gone from the UI — `WeeklyGoal.evaluation.rating` stays in the
 * schema untouched, so nothing already recorded is lost.
 */
export function WeeklyClient({ weekLabel, goals, initialReflection, reflectionGoalId }) {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [reflection, setReflection] = React.useState(initialReflection ?? "");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/ai/weekly", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (!res.ok) throw new Error();
        const payload = await res.json();
        if (!cancelled) setData(payload);
      } catch {
        if (!cancelled) toast.error("Couldn't put together this week's digest.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveReflection() {
    if (!reflectionGoalId) {
      toast.error("Set a weekly goal first — that's where reflections are stored.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/weekly-goals/${reflectionGoalId}/evaluate`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reflection }),
      });
      if (!res.ok) throw new Error();
      toast.success("Saved.");
    } catch {
      toast.error("Couldn't save that — your writing is still here.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingWeek />;

  const digest = data?.digest;
  const summary = digest?.weekSummary;

  return (
    <div className="space-y-5">
      {/* ① Your week */}
      <section className="rounded-xl border bg-card p-4 sm:p-5">
        <h2 className="text-sm font-medium">Your week</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {weekShape(summary)}
        </p>
        {summary && <WeekStats summary={summary} />}
      </section>

      {/* ② What we learned */}
      <section className="rounded-xl border bg-card p-4 sm:p-5">
        <h2 className="text-sm font-medium">What we learned</h2>
        {digest?.newPatterns?.length ? (
          <ul className="mt-3 space-y-3">
            {digest.newPatterns.map((pattern, i) => (
              <li
                key={pattern.id ?? i}
                className={cn(
                  "rounded-lg border p-3",
                  i === 0 && "border-brand/25 bg-brand/[0.04]"
                )}
              >
                <p className="text-sm leading-relaxed">{pattern.statement}</p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <ConfidencePill insight={pattern} />
                  {pattern.id && (
                    <Link
                      href={`/app/discoveries/${pattern.id}`}
                      className="inline-flex items-center gap-1 text-xs text-brand hover:underline"
                    >
                      See the evidence <ArrowRight className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {digest?.testedCount
              ? `Nothing new held up this week — we tested ${digest.testedCount} possible relationships. That's a real result, not a gap.`
              : "Nothing new this week."}
          </p>
        )}
      </section>

      {/* ③ What held — the emotional core */}
      <section className="rounded-xl border bg-card p-4 sm:p-5">
        <h2 className="text-sm font-medium">What held</h2>
        {digest?.checkIns?.length ? (
          <ul className="mt-3 space-y-2.5">
            {digest.checkIns.map((check) => (
              <li key={check.id} className="flex items-start gap-2.5">
                <CheckIcon outcome={check.outcome} />
                <div className="min-w-0">
                  <p className="text-sm leading-relaxed">{check.statement}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {CHECK_IN_LABEL[check.outcome]}
                    {check.timesConfirmed > 1 &&
                      ` · confirmed ${check.timesConfirmed} times`}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Nothing from previous weeks came up for re-testing this week.
          </p>
        )}
      </section>

      {/* ④ Worth sitting with */}
      {data?.reflection?.text && (
        <section className="rounded-xl border border-brand/25 bg-brand/[0.04] p-4 sm:p-5">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-brand" />
            Worth sitting with
          </h2>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
            {data.reflection.text}
          </p>
        </section>
      )}

      {/* ⑤ Your reflection — one box for the week, not one per goal */}
      <section className="rounded-xl border bg-card p-4 sm:p-5">
        <h2 className="text-sm font-medium">Your reflection</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {weekLabel}
        </p>
        <Textarea
          value={reflection}
          onChange={(e) => setReflection(e.target.value)}
          rows={4}
          placeholder="What actually happened this week?"
          className="mt-3"
        />
        <div className="mt-3 flex items-center gap-3">
          <Button size="sm" onClick={saveReflection} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save reflection
          </Button>
          {!reflectionGoalId && (
            <span className="text-xs text-muted-foreground">
              Add a weekly goal to store this.
            </span>
          )}
        </div>
      </section>

      {goals?.length > 0 && <GoalSummary goals={goals} />}
    </div>
  );
}

/** Goals as a compact line, not a checklist to re-tick. */
function GoalSummary({ goals }) {
  return (
    <section className="rounded-xl border bg-card p-4 sm:p-5">
      <h2 className="text-sm font-medium">This week&apos;s goals</h2>
      <ul className="mt-3 space-y-1.5">
        {goals.map((goal) => {
          const items = goal.checklistItems || [];
          const done = items.filter((i) => i.isComplete).length;
          const pct = items.length ? Math.round((done / items.length) * 100) : 0;
          return (
            <li key={goal._id} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate text-muted-foreground">{goal.title}</span>
              <span className="tnum shrink-0 text-xs text-muted-foreground">
                {done}/{items.length} · {pct}%
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function CheckIcon({ outcome }) {
  const map = {
    [CHECK_IN.HELD]: { Icon: CheckCircle2, className: "text-positive" },
    [CHECK_IN.STRENGTHENED]: { Icon: TrendingUp, className: "text-positive" },
    [CHECK_IN.WEAKENED]: { Icon: TrendingDown, className: "text-muted-foreground" },
    [CHECK_IN.FADED]: { Icon: XCircle, className: "text-muted-foreground" },
  };
  const { Icon, className } = map[outcome] ?? {
    Icon: MinusCircle,
    className: "text-muted-foreground",
  };
  return <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", className)} />;
}

/** One pre-computed sentence naming the shape of the week. */
function weekShape(summary) {
  if (!summary || !summary.daysRecorded) {
    return "Nothing was recorded this week, so there's nothing to compare against.";
  }
  const parts = [`You recorded something on ${summary.daysRecorded} of 7 days`];
  if (summary.averageMood !== null) {
    parts.push(
      `mood averaged ${summary.averageMood} across ${summary.moodDaysRecorded} days`
    );
  }
  if (summary.spendRupees) {
    const change =
      summary.spendChangePercent === null
        ? ""
        : ` (${summary.spendChangePercent > 0 ? "up" : "down"} ${Math.abs(
            summary.spendChangePercent
          )}% on last week)`;
    parts.push(`you logged NPR ${summary.spendRupees.toLocaleString("en-IN")}${change}`);
  }
  return `${parts.join(", ")}.`;
}

function WeekStats({ summary }) {
  const stats = [
    { label: "Logged", value: `NPR ${summary.spendRupees.toLocaleString("en-IN")}` },
    {
      label: "Mood",
      value: summary.averageMood === null ? "—" : summary.averageMood.toFixed(1),
    },
    {
      label: "Habits",
      value:
        summary.habitCompletionPercent === null
          ? "—"
          : `${summary.habitCompletionPercent}%`,
    },
    { label: "Journal", value: `${summary.journalDays} days` },
  ];

  return (
    <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.label} className="rounded-lg bg-muted/40 px-3 py-2">
          <dt className="text-xs text-muted-foreground">{stat.label}</dt>
          <dd className="tnum mt-0.5 text-sm font-medium">{stat.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function LoadingWeek() {
  return (
    <div className="space-y-4" aria-busy="true">
      <p className="text-sm text-muted-foreground">Putting your week together…</p>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />
      ))}
    </div>
  );
}
