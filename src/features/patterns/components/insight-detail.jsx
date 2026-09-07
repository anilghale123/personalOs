"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Check, ThumbsDown, ThumbsUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { fromMinorUnits } from "@/lib/money";
import { CAVEATS } from "../constants";
import { confidenceLabel, weeksSince } from "../feed";
import { usePatternStore } from "../store";
import { ConfidencePill } from "./confidence-pill";
import { DomainChips } from "./insight-card";
import { EvidenceChart, StrengthHistoryChart } from "./evidence-chart";

/**
 * One finding, in full.
 *
 * The section that matters most is "the days behind it": an actual table
 * of contributing dates, each linking back to that day's journal or a
 * date-filtered expense list. That is what separates this from a chatbot
 * that guesses — the user can go and check.
 */
export function InsightDetail({ insight }) {
  const [showStats, setShowStats] = React.useState(false);

  return (
    <article className="max-w-[820px]">
      <div>
        <Link
          href="/app"
          className="mb-[22px] inline-flex min-h-[40px] items-center gap-1.5 font-display text-sm text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Discoveries
        </Link>
      </div>

      {/* ① The statement */}
      <header className="mb-9">
        <DomainChips domains={insight.domains} className="mb-[18px]" />
        <h1 className="max-w-[26ch] text-balance font-display text-[28px] leading-[1.1] tracking-tight sm:text-4xl lg:text-[46px]">
          {insight.statement}
        </h1>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <ConfidencePill insight={insight} />
          <span className="tnum text-[15px] text-sand-600">
            {insight.n} days · {insight.windowFrom} to {insight.windowTo}
          </span>
        </div>
        {insight.status === "stale" && (
          <p className="mt-4 rounded-md border border-dashed border-sand-400 px-3 py-2 text-sm text-sand-600">
            This pattern no longer holds. It was last confirmed on{" "}
            {formatDay(insight.lastConfirmedAt)} — the history below is kept so
            you can see how it faded.
          </p>
        )}
      </header>

      {/* ② What this means — interpretation, clearly marked as such */}
      <NarrationBlock insight={insight} />

      {/* ③ The evidence */}
      <Section title="The evidence">
        <EvidenceChart insight={insight} />
        <GroupSummary insight={insight} />
      </Section>

      {/* ④ The days behind it */}
      <ContributingDays insight={insight} />

      {/* ⑤ How confident we are */}
      <Section title="How confident we are">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Tested across{" "}
          <span className="tnum text-foreground">{insight.n} days</span> where
          both values were recorded. {confirmationSentence(insight)}{" "}
          {confidenceLabel(insight)}.
        </p>

        <button
          type="button"
          onClick={() => setShowStats((v) => !v)}
          className="mt-3 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          {showStats ? "Hide the statistics" : "Show the statistics"}
        </button>
        {showStats && (
          <dl className="tnum mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-4">
            <Stat label="Effect size" value={round(insight.effect?.standardised)} />
            <Stat label="p-value" value={format4(insight.pValue)} />
            <Stat label="q-value (FDR)" value={format4(insight.qValue)} />
            <Stat label="Sample" value={insight.n} />
          </dl>
        )}
      </Section>

      {/* ⑥ What this doesn't tell you — never collapsed */}
      <Section title="What this doesn't tell you">
        <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground">
          <li>
            This is an association, not a cause. Two things moving together
            doesn&apos;t establish that either one moves the other.
          </li>
          {(insight.evidence?.caveats ?? []).map((key) =>
            CAVEATS[key] ? <li key={key}>{CAVEATS[key]}</li> : null
          )}
          {insight.unstable && (
            <li>
              The direction of this one has flipped since the last check, so
              treat it as unsettled.
            </li>
          )}
        </ul>
      </Section>

      {/* ⑦ How it's changed */}
      {insight.strengthHistory?.length > 1 && (
        <Section title="How it's changed">
          <StrengthHistoryChart history={insight.strengthHistory} />
          <p className="mt-2 text-xs text-muted-foreground">
            Strength at each check since {formatDay(insight.firstDetectedAt)}.
          </p>
        </Section>
      )}

      {/* ⑧ Feedback */}
      <FeedbackRow insight={insight} />
    </article>
  );
}

/**
 * Narration and the optional "why might this be?".
 *
 * Both are styled as interpretation and both are strictly additive: if
 * Groq is down, rate-limited, or the output failed the numeric or causal
 * guards, this block simply offers to try — the statement, chart and
 * evidence above it are unaffected. That is the whole reason narration
 * lives here and never on the feed cards.
 */
function NarrationBlock({ insight }) {
  const [narration, setNarration] = React.useState(insight.narration?.text ?? null);
  const [explanation, setExplanation] = React.useState(insight.explanation?.text ?? null);
  const [busy, setBusy] = React.useState(null);
  const [notice, setNotice] = React.useState(null);

  const ask = async (mode, { regenerate = false } = {}) => {
    setBusy(mode);
    setNotice(null);
    try {
      const res = await fetch(`/api/patterns/insights/${insight.id}/narrate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, regenerate }),
      });
      const data = await res.json();
      if (!res.ok || !data.text) {
        setNotice(
          data?.message ??
            "Couldn't write this one up just now — the finding itself is unchanged."
        );
        return;
      }
      if (mode === "explain") setExplanation(data.text);
      else setNarration(data.text);
    } catch {
      setNotice("Couldn't reach the writing service — the finding itself is unchanged.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="border-b border-border pb-[34px]">
      <h2 className="mb-2.5 font-display text-[20px]">What this means</h2>

      {narration ? (
        <>
          <p className="max-w-[62ch] text-base leading-[1.7] text-sand-800 sm:text-[18px]">{narration}</p>
          <p className="mt-2.5 text-sm italic text-sand-600">
            Interpretation, written from the figures above — no new numbers.
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          The statement above is the finding. If you&apos;d like it in a
          different set of words, ask.
        </p>
      )}

      {explanation && (
        <div className="mt-4 rounded-lg bg-muted/40 p-3">
          <p className="mb-1.5 text-xs font-medium">Why might this be?</p>
          <p className="text-sm leading-relaxed text-muted-foreground">{explanation}</p>
          <p className="mt-2.5 text-sm italic text-sand-600">
            Possibilities, not conclusions. None of these has been tested.
          </p>
        </div>
      )}

      {notice && <p className="mt-3 text-xs text-muted-foreground">{notice}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => ask("narrate", { regenerate: Boolean(narration) })}
          disabled={busy !== null}
          className="inline-flex min-h-[36px] items-center rounded-md border px-3 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
        >
          {busy === "narrate"
            ? "Writing…"
            : narration
              ? "Rewrite"
              : "Put this in words"}
        </button>
        {!explanation && (
          <button
            type="button"
            onClick={() => ask("explain")}
            disabled={busy !== null}
            className="inline-flex min-h-[36px] items-center rounded-md border px-3 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
          >
            {busy === "explain" ? "Thinking…" : "Why might this be?"}
          </button>
        )}
      </div>
    </section>
  );
}

function Section({ title, children }) {
  return (
    <section className="border-b border-border py-[34px]">
      <h2 className="mb-2.5 font-display text-[20px]">{title}</h2>
      {children}
    </section>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <dt className="text-muted-foreground/70">{label}</dt>
      <dd className="text-foreground">{value ?? "—"}</dd>
    </div>
  );
}

/** Group means and medians, spelled out under the chart. */
function GroupSummary({ insight }) {
  const groups = insight.evidence?.groups;
  if (!groups || Array.isArray(groups)) return null;

  const unit = insight.effect?.unit;
  return (
    <dl className="mt-4 grid gap-3 sm:grid-cols-2">
      {["a", "b"].map((key) => {
        const group = groups[key];
        if (!group) return null;
        return (
          <div key={key} className="rounded-lg bg-muted/40 px-3 py-2">
            <dt className="text-xs text-muted-foreground">{group.label}</dt>
            <dd className="tnum mt-0.5 text-sm">
              {formatUnit(group.median, unit)}{" "}
              <span className="text-xs text-muted-foreground">
                typical · {group.n} days
              </span>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/**
 * The contributing days, each linking to where that day actually lives.
 *
 * Money findings link to the expense list filtered to that date; anything
 * mood- or journal-shaped links to that day's journal page.
 */
function ContributingDays({ insight }) {
  const [expanded, setExpanded] = React.useState(false);
  const days = insight.evidence?.topDays ?? [];
  if (!days.length) return null;

  const shown = expanded ? days : days.slice(0, 6);
  const unit = insight.effect?.unit;
  const isMoney = unit === "paisa";

  return (
    <Section title="The days behind it">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[280px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="pb-2 font-medium">Day</th>
              <th className="pb-2 font-medium">Value</th>
              <th className="pb-2 font-medium">Group</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((day, i) => (
              <tr key={`${day.date}-${i}`} className="border-b border-border/50 last:border-0">
                <td className="py-2">
                  <Link
                    href={
                      isMoney
                        ? `/app/budget/expenses?dateFrom=${day.date}&dateTo=${day.date}`
                        : `/app/journal?date=${day.date}`
                    }
                    className="text-brand hover:underline"
                  >
                    {formatDay(day.date)}
                  </Link>
                </td>
                <td className="tnum py-2">{formatUnit(day.value ?? day.y, unit)}</td>
                <td className="py-2 text-xs text-muted-foreground">
                  {day.label ?? day.group ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {days.length > 6 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          {expanded ? "Show fewer" : `Show all ${days.length}`}
        </button>
      )}
    </Section>
  );
}

function FeedbackRow({ insight }) {
  const rate = usePatternStore((s) => s.rateInsight);
  const current = insight.feedback?.rating;

  const options = [
    { rating: "useful", label: "Useful", icon: ThumbsUp },
    { rating: "not_useful", label: "Not useful", icon: ThumbsDown },
    { rating: "knew_it", label: "I already knew this", icon: Check },
  ];

  return (
    <section className="rounded-2xl bg-card elev-sm p-4 sm:p-5">
      <h2 className="mb-3.5 font-display text-[20px]">Was this worth knowing?</h2>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const Icon = option.icon;
          const active = current === option.rating;
          return (
            <button
              key={option.rating}
              type="button"
              onClick={() => rate(insight.id, option.rating)}
              aria-pressed={active}
              className={cn(
                "inline-flex min-h-[40px] items-center gap-2 rounded-md border px-3 text-sm transition-colors",
                active
                  ? "border-foreground/20 bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-sand-200/60 hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {option.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** "Confirmed in 4 checks since 12 July." */
function confirmationSentence(insight) {
  const times = insight.timesConfirmed ?? 1;
  if (times <= 1) return "This is the first time it has shown up.";
  const weeks = weeksSince(insight.firstDetectedAt);
  const since = formatDay(insight.firstDetectedAt);
  return weeks >= 1
    ? `Confirmed in ${times} checks since ${since}.`
    : `Confirmed in ${times} checks.`;
}

function formatUnit(value, unit) {
  if (value === null || value === undefined) return "—";
  if (unit === "paisa") {
    return `NPR ${Math.round(fromMinorUnits(value)).toLocaleString("en-IN")}`;
  }
  if (unit === "mood_points") return Number(value).toFixed(1);
  return round(value);
}

function formatDay(value) {
  if (!value) return "—";
  const date = new Date(typeof value === "string" && value.length === 10 ? `${value}T12:00:00` : value);
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function round(value) {
  return typeof value === "number" ? Number(value.toFixed(2)) : value ?? "—";
}

function format4(value) {
  if (typeof value !== "number") return "—";
  return value < 0.0001 ? "<0.0001" : value.toFixed(4);
}
