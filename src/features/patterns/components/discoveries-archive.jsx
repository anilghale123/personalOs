"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { rankFeed } from "../feed";
import { usePatternStore } from "../store";
import { InsightCard } from "./insight-card";

/**
 * The archive — everything this app has ever told the user about
 * themselves, including the patterns that faded and the ones they hid.
 *
 * This is where someone goes to ask "what has this actually taught me?",
 * which makes it the strongest retention surface in the product. Nothing
 * is ever deleted, so nothing here is ever missing.
 */

const STATUS_FILTERS = [
  { id: "active", label: "Holding" },
  { id: "stale", label: "Faded" },
  { id: "dismissed", label: "Hidden" },
  { id: "all", label: "Everything" },
];

const SORTS = [
  { id: "strength", label: "Strongest" },
  { id: "recent", label: "Last confirmed" },
  { id: "first", label: "First found" },
];

export function DiscoveriesArchive({ initial }) {
  const [status, setStatus] = React.useState("active");
  const [domain, setDomain] = React.useState("all");
  const [sort, setSort] = React.useState("strength");
  const restore = usePatternStore((s) => s.restoreInsight);
  const [items, setItems] = React.useState(initial ?? []);

  const domains = React.useMemo(
    () => [...new Set((initial ?? []).flatMap((i) => i.domains ?? []))],
    [initial]
  );

  const visible = React.useMemo(() => {
    const filtered = items.filter(
      (i) =>
        (status === "all" || i.status === status) &&
        (domain === "all" || (i.domains ?? []).includes(domain))
    );
    if (sort === "strength") return rankFeed(filtered);
    return [...filtered].sort((a, b) =>
      sort === "recent"
        ? new Date(b.lastConfirmedAt) - new Date(a.lastConfirmedAt)
        : new Date(b.firstDetectedAt) - new Date(a.firstDetectedAt)
    );
  }, [items, status, domain, sort]);

  return (
    <>
      <header className="mb-5">
        <Link
          href="/app"
          className="inline-flex min-h-[40px] items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Discoveries
        </Link>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight">
          All discoveries
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every pattern found so far — including the ones that stopped holding.
        </p>
      </header>

      <div className="mb-5 space-y-3">
        <FilterRow
          label="Status"
          options={STATUS_FILTERS}
          value={status}
          onChange={setStatus}
        />
        {domains.length > 1 && (
          <FilterRow
            label="Domain"
            options={[{ id: "all", label: "All" }, ...domains.map((d) => ({ id: d, label: titleCase(d) }))]}
            value={domain}
            onChange={setDomain}
          />
        )}
        <FilterRow label="Sort" options={SORTS} value={sort} onChange={setSort} />
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-card/50 px-5 py-10 text-center text-sm text-muted-foreground">
          Nothing here yet.
        </p>
      ) : (
        <div className="space-y-3">
          {visible.map((insight) =>
            insight.status === "dismissed" ? (
              <HiddenRow
                key={insight.id}
                insight={insight}
                onRestore={async () => {
                  await restore(insight.id);
                  setItems((rows) =>
                    rows.map((r) => (r.id === insight.id ? { ...r, status: "stale" } : r))
                  );
                }}
              />
            ) : (
              <InsightCard key={insight.id} insight={insight} />
            )
          )}
        </div>
      )}
    </>
  );
}

function FilterRow({ label, options, value, onChange }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          aria-pressed={value === option.id}
          className={cn(
            "min-h-[36px] rounded-full border px-3 text-xs transition-colors",
            value === option.id
              ? "border-foreground/20 bg-accent text-foreground"
              : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** A hidden insight, shown muted with a way back. */
function HiddenRow({ insight, onRestore }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed bg-card/40 p-4">
      <p className="text-sm text-muted-foreground line-clamp-2">{insight.statement}</p>
      <button
        type="button"
        onClick={onRestore}
        className="shrink-0 rounded-md border px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Unhide
      </button>
    </div>
  );
}

function titleCase(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
