"use client";

import * as React from "react";
import Link from "next/link";
import { format } from "date-fns";
import {
  ChevronDown,
  RefreshCw,
  Receipt,
  Target,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Lifeline } from "@/components/brand-mark";
import { MOODS } from "@/features/journal/components/mood-picker";
import { usePatternStore } from "../store";
import { splitFeed } from "../feed";
import { HeadlineInsight, InsightRow } from "./insight-card";
import { MoneyBriefing, HabitsBriefing } from "./weekly-briefing";

/**
 * Home.
 *
 * Money leads, habits and goals follow — those two are read every day and
 * are cheap to produce. Pattern discovery sits underneath, closed, and
 * runs only when asked: it is a ninety-day scan across six collections,
 * and firing it on every visit meant the whole page waited on the one
 * part of it nobody had asked for yet.
 */
export function DiscoveriesScreen({ initial, lifeline, briefing, firstName }) {
  const hydrate = usePatternStore((s) => s.hydrate);

  // Seed from the server payload before first paint.
  React.useEffect(() => {
    hydrate(initial);
  }, [hydrate, initial]);

  return (
    <>
      <header className="mb-8">
        <p className="kicker mb-2.5">{format(new Date(), "EEEE, d MMMM")}</p>
        <h1 className="font-display text-[26px] leading-[1.12] tracking-tight sm:text-[34px]">
          Good {greeting()}, {firstName}
        </h1>
      </header>

      <LifelineStrip days={lifeline} />

      <div className="max-w-[860px] space-y-4">
        <MoneyBriefing briefing={briefing} />
        <HabitsBriefing briefing={briefing} />
      </div>

      <div className="max-w-[860px]">
        <QuickLog />
        <PatternDiscovery />
      </div>
    </>
  );
}

/** The week as recorded — the one element that already composited domains. */
function LifelineStrip({ days }) {
  if (!days?.length) return null;
  const labels = ["M", "T", "W", "T", "F", "S", "S"];

  return (
    <Link
      href="/app/journal"
      className="mb-6 block rounded-2xl bg-card px-4 py-3.5 elev-sm transition-colors hover:bg-sand-200 sm:px-5"
      aria-label="Your week on record — open the journal"
    >
      <div className="flex items-end justify-between gap-4">
        <Lifeline
          values={days.map((d) => d.value)}
          className="h-8 w-40 text-brand sm:h-9 sm:w-48"
          animated={false}
        />
        <div className="flex gap-1.5">
          {days.map((d) => (
            <span
              key={d.date}
              className="w-5 text-center text-[10px] uppercase text-sand-600"
            >
              {labels[d.dow]}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}

/**
 * Pattern discovery — opt-in.
 *
 * Closed, this costs nothing: the stored count comes from the payload the
 * page already had. Opening it is what fetches coverage and, when there
 * is nothing stored, asks the engine to look.
 */
function PatternDiscovery() {
  const insights = usePatternStore((s) => s.insights);
  const readiness = usePatternStore((s) => s.readiness);
  const meta = usePatternStore((s) => s.meta);
  const runStatus = usePatternStore((s) => s.runStatus);
  const runPatterns = usePatternStore((s) => s.runPatterns);
  const loadReadiness = usePatternStore((s) => s.loadReadiness);

  const [open, setOpen] = React.useState(false);

  const { headline, rest } = React.useMemo(
    () => splitFeed(insights ?? []),
    [insights]
  );

  const computing = runStatus === "running";
  const hasFindings = Boolean(headline);
  const hasRun = Boolean(meta?.hasEverRun);
  const stored = (insights ?? []).filter((i) => i.status === "active").length;

  function openSection() {
    setOpen(true);
    loadReadiness();
    // Nothing to show and nothing in flight? The tap *is* the request.
    if (!hasFindings && !computing) runPatterns({ force: true });
  }

  if (!open) {
    return (
      <section className="mt-[34px] rounded-3xl border border-sand-300 bg-card px-5 py-5 sm:px-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sage-200">
            <Sparkles className="h-[18px] w-[18px] text-sage-700" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[19px]">Pattern discovery</h2>
            <p className="mt-1 max-w-[52ch] text-sm leading-[1.6] text-sand-600">
              Tests relationships across your money, habits and journal over
              the last 90 days. It is a heavy check, so it only runs when you
              ask for it.
            </p>

            <button
              type="button"
              onClick={openSection}
              className="mt-3.5 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Sparkles className="h-4 w-4" />
              {stored > 0
                ? `Show ${stored} pattern${stored === 1 ? "" : "s"}`
                : "Look for patterns"}
              <ChevronDown className="h-4 w-4" />
            </button>

            {meta?.lastRunAt && (
              <p className="mt-2.5 text-[13px] text-sand-600">
                Last checked {format(new Date(meta.lastRunAt), "d MMM, HH:mm")}
              </p>
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-[34px]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-display text-[19px]">Pattern discovery</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="min-h-[40px] rounded-full px-3 text-[13px] text-sand-600 transition-colors hover:text-foreground"
        >
          Hide
        </button>
      </div>

      {computing && !hasFindings ? (
        <ComputingState />
      ) : hasFindings ? (
        <>
          <HeadlineInsight insight={headline} />

          {rest.length > 0 && (
            <div className="py-[34px]">
              <h3 className="mb-1 font-display text-[19px]">Also noticed</h3>
              <div>
                {rest.map((insight) => (
                  <InsightRow key={insight.id} insight={insight} />
                ))}
              </div>
            </div>
          )}
        </>
      ) : readiness && !readiness.hasMinimumActivity ? (
        <EmptyDiscoveries readiness={readiness} />
      ) : hasRun ? (
        <NothingFound hypotheses={meta?.hypothesesTested ?? 0} />
      ) : (
        <ComputingState />
      )}

      <FeedFooter
        meta={meta}
        computing={computing}
        onCheck={() => runPatterns({ force: true })}
      />
    </section>
  );
}

/** Skeleton cards while a run is in flight. */
function ComputingState() {
  return (
    <div aria-busy="true" aria-live="polite">
      <p className="mb-3 text-[15px] text-sand-600">
        Testing relationships across the last 90 days…
      </p>
      <div className="space-y-3">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    </div>
  );
}

/** New user, or one whose window is still nearly empty. */
function EmptyDiscoveries({ readiness }) {
  return (
    <div className="rounded-3xl border border-dashed border-sand-400 px-5 py-10 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-sage-200">
        <Sparkles className="h-5 w-5 text-sage-700" />
      </div>
      <p className="text-sm font-medium">Nothing to discover yet — that&apos;s expected.</p>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
        Patterns need about three weeks of data before anything can be tested
        honestly. Log your mood today and we&apos;ll start looking.
      </p>
      {readiness ? (
        <p className="tnum mt-3 text-xs text-muted-foreground">
          {readiness.activeDays} of {readiness.minActiveDays} days recorded so far
        </p>
      ) : null}
    </div>
  );
}

/**
 * The most important state in the product.
 *
 * A product that always finds something is a product that is lying. Said
 * plainly, "we tested 34 things and none held up" becomes a trust signal
 * rather than a failure — and it is a genuinely informative result.
 */
function NothingFound({ hypotheses }) {
  return (
    <div className="border-b border-border pb-10">
      <p className="kicker mb-5 text-[13px]">Nothing held up this time</p>
      <p className="max-w-[58ch] text-base leading-[1.65] text-sand-700 sm:text-[18px]">
        {hypotheses > 0 ? (
          <>
            We tested{" "}
            <span className="tnum font-medium text-foreground">{hypotheses}</span>{" "}
            possible relationships across your money, habits and journal. None of
            them held up statistically.
          </>
        ) : (
          <>We looked across your money, habits and journal and nothing held up statistically.</>
        )}{" "}
        That&apos;s a real result — it means your spending isn&apos;t being pushed
        around by the things we can currently see.
      </p>
    </div>
  );
}

/**
 * Capture, where the user already is.
 *
 * Mood is the binding constraint on most of the engine — it's optional,
 * nullable, and half the detectors need roughly 24 days of it — so mood
 * gets a real one-tap control here. Expenses and habits already have good
 * capture screens; these link straight to them rather than cloning them.
 */
function QuickLog() {
  const logMood = usePatternStore((s) => s.logMood);
  const logged = usePatternStore((s) => s.moodLoggedToday);

  return (
    <section className="pt-[34px]">
      <h3 className="mb-3.5 font-display text-[19px]">Quick log</h3>

      <div className="flex flex-wrap items-center gap-2">
        {MOODS.map((mood) => (
          <button
            key={mood.key}
            type="button"
            onClick={() => logMood(mood.key)}
            title={mood.label}
            aria-pressed={logged === mood.key}
            className={cn(
              "flex min-h-[40px] items-center gap-1.5 rounded-full px-4 text-sm transition-colors",
              logged === mood.key
                ? "bg-primary text-primary-foreground"
                : "bg-sand-200 text-sand-700 hover:bg-sand-300 hover:text-foreground"
            )}
          >
            <span className="text-base leading-none">{mood.emoji}</span>
            <span className="hidden text-xs sm:inline">{mood.label}</span>
          </button>
        ))}
      </div>

      <div className="mt-3.5 flex flex-wrap gap-2">
        <Link
          href="/app/budget/expenses"
          className="inline-flex min-h-[40px] items-center gap-2 rounded-full px-2.5 text-[15px] text-sand-600 transition-colors hover:text-foreground"
        >
          <Receipt className="h-4 w-4" />
          Log an expense
        </Link>
        <Link
          href="/app/goals"
          className="inline-flex min-h-[40px] items-center gap-2 rounded-full px-2.5 text-[15px] text-sand-600 transition-colors hover:text-foreground"
        >
          <Target className="h-4 w-4" />
          Tick off a habit
        </Link>
      </div>
    </section>
  );
}

/** When we last looked, and the manual "look again" control. */
function FeedFooter({ meta, computing, onCheck }) {
  return (
    <div className="mt-[30px] flex flex-wrap items-center gap-[18px]">
      <p className="text-[13px] text-sand-600">
        {meta?.lastRunAt
          ? `Last checked ${format(new Date(meta.lastRunAt), "d MMM, HH:mm")}`
          : "Not checked yet"}
        {" · "}
        <Link href="/app/discoveries" className="hover:text-foreground hover:underline">
          All discoveries
        </Link>
      </p>

      <button
        type="button"
        onClick={onCheck}
        disabled={computing}
        className="inline-flex min-h-[40px] items-center gap-2 rounded-full px-3 font-display text-[13px] text-primary transition-colors hover:bg-primary/10 disabled:opacity-[0.45]"
      >
        <RefreshCw className={cn("h-3.5 w-3.5", computing && "animate-spin")} />
        {computing ? "Checking…" : "Check for new patterns"}
      </button>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}
