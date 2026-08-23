"use client";

import * as React from "react";
import Link from "next/link";
import { MoreHorizontal, ThumbsDown, ThumbsUp, Check, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePatternStore } from "../store";
import { ConfidencePill } from "./confidence-pill";
import { MiniEvidence } from "./evidence-chart";

/** Domain chips — the two worlds a finding sits between. */
const DOMAIN_META = {
  money: { label: "Money", icon: "💰" },
  journal: { label: "Mood", icon: "🧠" },
  habits: { label: "Habits", icon: "🔁" },
};

export function DomainChips({ domains, className }) {
  return (
    <span className={cn("flex flex-wrap items-center gap-1 text-xs text-muted-foreground", className)}>
      {(domains ?? []).map((domain, i) => {
        const meta = DOMAIN_META[domain] ?? { label: domain, icon: "•" };
        return (
          <React.Fragment key={domain}>
            {i > 0 && <span className="text-muted-foreground/50">×</span>}
            <span className="inline-flex items-center gap-1">
              <span aria-hidden="true">{meta.icon}</span>
              {meta.label}
            </span>
          </React.Fragment>
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
          className="absolute right-0 top-10 z-20 w-52 overflow-hidden rounded-lg border bg-card py-1 shadow-lg"
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
        "group relative rounded-xl border bg-card p-4 transition-colors hover:border-foreground/20 sm:p-5",
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
    <article className="relative rounded-xl border border-brand/25 bg-brand/[0.04] p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-brand">
          <span aria-hidden="true">✦</span> Headline discovery
        </span>
        <OverflowMenu insight={insight} />
      </div>

      <Link
        href={`/app/discoveries/${insight.id}`}
        onClick={() => markRead(insight.id)}
        className="mt-3 block focus:outline-none"
      >
        <span className="absolute inset-0 z-0" aria-hidden="true" />
        <p className="relative z-10 font-display text-lg leading-snug sm:text-xl">
          {insight.statement}
        </p>
      </Link>

      <div className="relative z-10 mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <ConfidencePill insight={insight} />
        <span className="tnum text-xs text-muted-foreground">
          Based on {insight.n} days
        </span>
        <Link
          href={`/app/discoveries/${insight.id}`}
          onClick={() => markRead(insight.id)}
          className="relative z-10 text-xs font-medium text-brand hover:underline"
        >
          See the evidence →
        </Link>
      </div>
    </article>
  );
}
