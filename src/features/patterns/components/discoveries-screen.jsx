"use client";

import * as React from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ChevronDown, RefreshCw, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppUser } from "@/components/app-user";
import { useScreenData } from "@/lib/screen-data";
import { useClientClock } from "@/lib/client-clock";
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
export function DiscoveriesScreen() {
  const user = useAppUser();
  const userId = user?.id;
  const firstName = user?.name?.split(" ")[0] || "there";
  const hydrate = usePatternStore((s) => s.hydrate);
  // Read on the device, not during render: this route is prerendered, so a
  // date worked out here would be the date of the deploy.
  const [now] = useClientClock(() => new Date());

  /**
   * Read during render, not in an effect. An effect runs after the browser
   * has painted, so reading the saved copy there guaranteed a frame of
   * placeholders before the briefings appeared — even though they were on
   * the device the whole time.
   */
  const { data, failed } = useScreenData(userId, "home", "/api/patterns/home");

  // Only the first open on a device has nothing to show.
  const pending = data === null && !failed;

  React.useEffect(() => {
    if (failed && data === null) toast.error("Couldn't load your home screen.");
  }, [failed, data]);

  // The feed lives in a store because a pattern run writes to it too. A run
  // in flight owns it; its own refresh lands the result.
  React.useEffect(() => {
    if (!data) return;
    if (usePatternStore.getState().runStatus !== "running") {
      hydrate(data.discoveries);
    }
  }, [data, hydrate]);

  const briefing = data?.briefing ?? null;

  return (
    <>
      <header className="mb-8">
        {/* A non-breaking space rather than nothing, so the greeting below
            does not jump up a line for the one render before the clock is
            read. */}
        <p className="kicker mb-2.5">
          {now ? format(now, "EEEE, d MMMM") : " "}
        </p>
        <h1 className="font-display text-[26px] leading-[1.12] tracking-tight sm:text-[34px]">
          {now ? `Good ${greeting(now)}, ${firstName}` : `Hello, ${firstName}`}
        </h1>
      </header>

      <div className="max-w-[860px] space-y-4">
        {pending ? (
          <BriefingSkeleton />
        ) : (
          <>
            <MoneyBriefing briefing={briefing} />
            <HabitsBriefing briefing={briefing} />
          </>
        )}
      </div>

      {/* The discovery panel is closed by default and costs nothing to draw,
          so it is never withheld — it was only ever hidden here because it
          shared a flag with the briefings above. */}
      <div className="max-w-[860px]">
        <PatternDiscovery />
      </div>
    </>
  );
}

/** Stand-ins for the two briefing cards on the very first visit. */
function BriefingSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading your briefing">
      {[0, 1].map((i) => (
        <div
          key={i}
          className="space-y-3 rounded-3xl bg-sage-200/60 px-6 py-6 sm:px-[34px]"
          style={{ opacity: i === 0 ? 1 : 0.75 }}
        >
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-3.5 w-full max-w-md" />
          <Skeleton className="h-3.5 w-3/4 max-w-sm" />
        </div>
      ))}
    </div>
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

function greeting(now) {
  const h = now.getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}
