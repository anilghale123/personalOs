"use client";

import { cn } from "@/lib/utils";

/**
 * The card-sized glance at the evidence.
 *
 * Hand-drawn SVG rather than recharts: a feed can hold half a dozen of
 * these, and none of them needs axes, tooltips or a chart runtime to say
 * "these two groups differ by about this much".
 *
 * **Its own module on purpose.** This used to live alongside the recharts
 * charts in `evidence-chart.jsx`, which meant the Discoveries feed imported
 * recharts — over 100KB — purely to draw a 48×20 thumbnail that never used
 * it. Splitting the file is what lets the feed ship without the chart
 * runtime while the detail page loads it on demand.
 */
export function MiniEvidence({ insight, className }) {
  // The feed ships a compacted blob; the detail page and the insights API
  // carry the full one. Either draws the same thumbnail.
  const evidence = insight?.miniEvidence ?? insight?.evidence;
  if (!evidence?.kind) return null;

  if (evidence.kind === "two_group" && evidence.groups) {
    const a = Math.abs(evidence.groups.a?.median ?? 0);
    const b = Math.abs(evidence.groups.b?.median ?? 0);
    const max = Math.max(a, b, 1);
    return (
      <svg viewBox="0 0 48 20" className={cn("h-5 w-12", className)} role="img" aria-hidden="true">
        <rect x="4" y={20 - Math.max(2, (a / max) * 18)} width="14" height={Math.max(2, (a / max) * 18)} rx="2" fill="currentColor" />
        <rect x="26" y={20 - Math.max(2, (b / max) * 18)} width="14" height={Math.max(2, (b / max) * 18)} rx="2" fill="currentColor" opacity="0.35" />
      </svg>
    );
  }

  const points = (evidence.points ?? []).slice(0, 40);
  if (!points.length) return null;
  const xs = points.map((p) => p.x ?? 0);
  const ys = points.map((p) => p.y ?? 0);
  const scale = (v, list) => {
    const min = Math.min(...list);
    const max = Math.max(...list);
    return max === min ? 0.5 : (v - min) / (max - min);
  };

  return (
    <svg viewBox="0 0 48 20" className={cn("h-5 w-12", className)} role="img" aria-hidden="true">
      {points.map((p, i) => (
        <circle
          key={i}
          cx={2 + scale(xs[i], xs) * 44}
          cy={18 - scale(ys[i], ys) * 16}
          r="1.4"
          fill="currentColor"
          opacity="0.6"
        />
      ))}
    </svg>
  );
}
