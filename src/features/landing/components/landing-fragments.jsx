import { TrendingUp, Sparkles, Check } from "lucide-react";
import { Lifeline } from "@/components/brand-mark";

/**
 * Static UI fragments for the landing pillars — they look like the product
 * because they're built from the same tokens and type, not screenshots.
 */

const HEATMAP_WEEKS = [
  [1, 1, 0, 1, 1, 0.4, 1],
  [0.4, 1, 1, 1, 0, 1, 1],
  [1, 0, 1, 0.4, 1, 1, 0],
  [1, 1, 1, 1, 0.4, 1, 1],
];

export function WealthFragment() {
  return (
    <div className="rounded-xl border border-border bg-card p-4 text-left shadow-sm">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <TrendingUp className="h-3.5 w-3.5" />
          Portfolio
        </span>
        <span className="text-[11px] text-muted-foreground">NEPSE</span>
      </div>
      <p className="tnum mt-2 text-xl font-semibold tracking-tight">
        Rs 12,84,300
      </p>
      <p className="tnum mt-0.5 text-xs text-emerald-500">
        +Rs 28,410 this month
      </p>
      <div className="mt-3 space-y-1.5 border-t border-border/60 pt-3 text-xs">
        <div className="tnum flex justify-between">
          <span className="text-muted-foreground">Expenses today</span>
          <span>Rs 850</span>
        </div>
        <div className="tnum flex justify-between">
          <span className="text-muted-foreground">Food budget left</span>
          <span>Rs 4,200</span>
        </div>
      </div>
    </div>
  );
}

export function HabitsFragment() {
  return (
    <div className="rounded-xl border border-border bg-card p-4 text-left shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">This month</span>
        <span className="tnum text-[11px] text-muted-foreground">
          3 of 5 done today
        </span>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1.5">
        {HEATMAP_WEEKS.flat().map((v, i) => (
          <span
            key={i}
            className="aspect-square w-full rounded-[3px] bg-brand"
            style={{ opacity: v === 0 ? 0.08 : 0.25 + v * 0.75 }}
          />
        ))}
      </div>
      <div className="mt-3 space-y-1.5 border-t border-border/60 pt-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="flex h-4 w-4 items-center justify-center rounded border border-brand/50 bg-brand/15 text-brand">
            <Check className="h-2.5 w-2.5" />
          </span>
          <span>Morning walk</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="h-4 w-4 rounded border border-border" />
          <span>Read 20 pages</span>
        </div>
      </div>
    </div>
  );
}

export function JournalFragment() {
  return (
    <div className="rounded-xl border border-border bg-card p-4 text-left shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">Tuesday, Aug 18</span>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">
          Good
        </span>
      </div>
      <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
        Long day, but a good one. Closed the land paperwork finally, and the
        evening walk cleared my head…
      </p>
      <div className="mt-3 border-t border-border/60 pt-2.5">
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <Check className="h-3 w-3 text-brand" />
          Saved on this device — syncs when you&apos;re back online
        </span>
      </div>
    </div>
  );
}

export function BriefingFragment() {
  return (
    <div className="rounded-xl border border-border bg-card p-4 text-left shadow-sm">
      <span className="flex items-center gap-1.5 text-xs font-medium text-brand">
        <Sparkles className="h-3.5 w-3.5" />
        Weekly briefing
      </span>
      <p className="mt-2.5 text-sm leading-relaxed">
        You spent 38% more on weekends this month — almost all of it in the
        two weeks you journaled about poor sleep.
      </p>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        Your longest habit streaks start the day after an evening entry.
        Worth protecting that hour.
      </p>
    </div>
  );
}

/** The hero lifeline — two weeks of a life, taller where more was recorded. */
export function HeroLifeline() {
  const values = [
    0.25, 0.5, 0.35, 0.8, 0.6, 0.95, 0.4, 0.3, 0.55, 0.2, 0.85, 0.65, 1, 0.45,
  ];
  return (
    <figure>
      <div className="rounded-2xl border border-border bg-card/60 px-5 py-6 sm:px-8 sm:py-8">
        <Lifeline
          values={values}
          className="h-16 w-full text-brand sm:h-24 lg:h-28"
          stretch
        />
        <div className="mt-3 flex justify-between text-[10px] uppercase tracking-widest text-muted-foreground/70">
          <span>14 days ago</span>
          <span>today</span>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-xs text-muted-foreground lg:text-left">
        One tick per day — taller where more of the day was recorded. Words
        written, habits kept, money logged.
      </figcaption>
    </figure>
  );
}
