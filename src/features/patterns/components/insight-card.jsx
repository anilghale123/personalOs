"use client";

import * as React from "react";
import Link from "next/link";
import { MoreHorizontal, ThumbsDown, ThumbsUp, Check, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePatternStore } from "../store";
import { ConfidencePill } from "./confidence-pill";
import { MiniEvidence } from "./mini-evidence";

/** Domain chips — the two worlds a finding sits between. */
const DOMAIN_META = {
  money: { label: "Money", tone: "bg-clay-200 text-clay-900" },
  journal: { label: "Mood", tone: "bg-sage-200 text-sage-900" },
  habits: { label: "Habits", tone: "bg-sand-200 text-sand-800" },
};

/** The worlds a finding sits between, as Organic pills. */
export function DomainChips({ domains, className }) {
  return (
    <span className={cn("flex flex-wrap items-center gap-2", className)}>
      {(domains ?? []).map((domain) => {
        const meta = DOMAIN_META[domain] ?? {
          label: domain,
          tone: "bg-sand-200 text-sand-800",
        };
        return (
          <span
            key={domain}
            className={cn(
              "inline-flex h-7 items-center rounded-full px-3.5 text-[13px]",
              meta.tone
            )}
          >
            {meta.label}
          </span>
        );
      })}
    </span>
  );
}

/**
 * The window a finding was measured over, in words.
 * "last 3 months" reads better than "2026-05-24 – 2026-08-21".
 */
function windowLabel(insight) {
  if (!insight.windowFrom || !insight.windowTo) return null;
  const days =
    Math.round(
      (new Date(insight.windowTo) - new Date(insight.windowFrom)) / 86_400_000
    ) + 1;
  if (days >= 300) return "last year";
  if (days >= 80) return "last 3 months";
  if (days >= 50) return "last 2 months";
  if (days >= 25) return "last month";
  return `last ${days} days`;
}

/** Useful · Not useful · I already knew this · Hide. */
function OverflowMenu({ insight }) {
  const [open, setOpen] = React.useState(false);
  const rate = usePatternStore((s) => s.rateInsight);
  const dismiss = usePatternStore((s) => s.dismissInsight);
  const ref = React.useRef(null);

  React.useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const act = (fn) => () => {
    setOpen(false);
    fn();
  };

  const items = [
    { label: "Useful", icon: ThumbsUp, run: () => rate(insight.id, "useful") },
    { label: "Not useful", icon: ThumbsDown, run: () => rate(insight.id, "not_useful") },
    { label: "I already knew this", icon: Check, run: () => rate(insight.id, "knew_it") },
    { label: "Hide", icon: EyeOff, run: () => dismiss(insight.id) },
  ];

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Insight options"
        className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-10 z-20 w-52 overflow-hidden rounded-2xl bg-card elev-sm py-1 shadow-lg"
        >
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={act(item.run)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * One finding, as a card.
 *
 * The statement is always the deterministic template — LLM narration
 * lives on the detail page and nowhere else, so the feed still reads
 * correctly when Groq is rate-limited, down, or switched off entirely.
 */
export function InsightCard({ insight, className }) {
  const markRead = usePatternStore((s) => s.markRead);
  const window = windowLabel(insight);

  return (
    <article
      className={cn(
        "group relative rounded-2xl bg-card elev-sm p-4 transition-colors hover:border-foreground/20 sm:p-5",
        insight.status === "stale" && "opacity-70",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <DomainChips domains={insight.domains} />
        <OverflowMenu insight={insight} />
      </div>

      <Link
        href={`/app/discoveries/${insight.id}`}
        onClick={() => markRead(insight.id)}
        className="mt-2 block focus:outline-none"
      >
        {/* Stretches the link across the card without swallowing the menu. */}
        <span className="absolute inset-0 z-0" aria-hidden="true" />
        <p className="relative z-10 text-[15px] leading-relaxed">{insight.statement}</p>
      </Link>

      <div className="relative z-10 mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <ConfidencePill insight={insight} />
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <MiniEvidence insight={insight} className="text-brand" />
          <span className="tnum">
            {insight.n} days{window ? ` · ${window}` : ""}
          </span>
        </span>
      </div>

      {insight.status === "stale" && (
        <p className="relative z-10 mt-2.5 border-t pt-2.5 text-xs text-muted-foreground">
          This pattern no longer holds — last confirmed{" "}
          {new Date(insight.lastConfirmedAt).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
          })}
          .
        </p>
      )}
    </article>
  );
}

/**
 * The headline slot — one finding, given room.
 *
 * Deliberately singular. A wall of nine discoveries is dashboard fatigue
 * wearing a new hat; the point of ranking is that something gets to be
 * the most interesting thing today.
 */
export function HeadlineInsight({ insight }) {
  const markRead = usePatternStore((s) => s.markRead);

  return (
    <article className="relative border-b border-border pb-10">
      <div className="flex items-start justify-between gap-3">
        <p className="kicker text-[13px] text-clay-700">
          The one thing worth knowing
        </p>
        <OverflowMenu insight={insight} />
      </div>

      <Link
        href={`/app/discoveries/${insight.id}`}
        onClick={() => markRead(insight.id)}
        className="mt-5 block focus:outline-none"
      >
        <span className="absolute inset-0 z-0" aria-hidden="true" />
        <h2 className="relative z-10 max-w-[24ch] text-balance font-display text-[28px] leading-[1.1] sm:text-4xl lg:text-[52px]">
          {insight.statement}
        </h2>
      </Link>

      <div className="relative z-10 mt-[22px] flex flex-wrap items-center gap-x-[18px] gap-y-3">
        <Link
          href={`/app/discoveries/${insight.id}`}
          onClick={() => markRead(insight.id)}
          className={cn(
            "inline-flex items-center rounded-full bg-primary px-6 py-3 font-display text-sm",
            "text-primary-foreground transition-colors hover:bg-clay-600"
          )}
        >
          See the evidence
        </Link>
        <span className="flex flex-wrap items-center gap-2 text-sm text-sand-600">
          <ConfidencePill insight={insight} />
          <span className="tnum">· {insight.n} days</span>
        </span>
      </div>
    </article>
  );
}

/**
 * One secondary finding, as a row — the "Also noticed" form. Statement on
 * the left, the measurement on the right, separated by a hairline.
 */
export function InsightRow({ insight }) {
  const markRead = usePatternStore((s) => s.markRead);
  const window = windowLabel(insight);

  return (
    <Link
      href={`/app/discoveries/${insight.id}`}
      onClick={() => markRead(insight.id)}
      className={cn(
        "grid grid-cols-[1fr_auto] items-center gap-5 border-t border-border py-5 transition-colors",
        "hover:bg-sand-200/40 sm:grid-cols-[1fr_130px]",
        insight.status === "stale" && "opacity-70"
      )}
    >
      <p className="text-[15px] leading-[1.5] sm:text-[17px]">
        {insight.statement}
      </p>
      <span className="tnum text-right text-[13px] text-sand-600">
        {insight.n} days{window ? ` · ${window}` : ""}
      </span>
    </Link>
  );
}
