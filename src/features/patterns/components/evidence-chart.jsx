"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { fromMinorUnits } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * The evidence, drawn.
 *
 * One rule runs through every chart here: **show the outliers.** Trimming
 * them to make a plot look tidy is the visual version of the statistical
 * dishonesty the FDR correction exists to prevent — and the engine has
 * already refused to report any pattern that one day was carrying, so
 * what's left on screen is genuinely the shape of the finding.
 */

const AXIS = {
  stroke: "hsl(var(--muted-foreground))",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
};

/** Money arrives as integer paisa; charts show whole rupees. */
function formatValue(value, unit) {
  if (unit === "paisa") return `NPR ${Math.round(fromMinorUnits(value)).toLocaleString("en-IN")}`;
  if (unit === "mood_points") return Number(value).toFixed(1);
  return typeof value === "number" ? Number(value.toFixed(2)) : value;
}

function ChartTooltip({ active, payload, unit, labelKey = "date" }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-2xl bg-card elev-sm px-3 py-2 text-xs shadow-md">
      {row[labelKey] && <p className="font-medium">{row[labelKey]}</p>}
      {payload.map((entry) => (
        <p key={entry.dataKey} className="text-muted-foreground">
          {entry.name}: {formatValue(entry.value, unit)}
        </p>
      ))}
    </div>
  );
}

/** Two-group findings: the two distributions, with their medians marked. */
function TwoGroupChart({ evidence, unit }) {
  const groups = [evidence.groups?.a, evidence.groups?.b].filter(Boolean);
  const data = groups.map((g, i) => ({
    label: g.label,
    median: unit === "paisa" ? fromMinorUnits(g.median) : g.median,
    mean: unit === "paisa" ? fromMinorUnits(g.mean) : g.mean,
    n: g.n,
    fill: i === 0 ? "hsl(var(--brand))" : "hsl(var(--muted-foreground))",
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey="label" {...AXIS} interval={0} tickFormatter={(v) => shorten(v)} />
        <YAxis {...AXIS} width={54} tickFormatter={(v) => compact(v, unit)} />
        <Tooltip
          content={<ChartTooltip unit={unit === "paisa" ? "rupees" : unit} labelKey="label" />}
          cursor={{ fill: "hsl(var(--accent))", opacity: 0.35 }}
        />
        <Bar dataKey="median" name="Typical day" radius={[6, 6, 0, 0]}>
          {data.map((row, i) => (
            <Cell key={i} fill={row.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Correlations: every day plotted, outliers included by design. */
function CorrelationChart({ evidence, unit }) {
  const points = (evidence.points ?? []).map((p) => ({
    ...p,
    x: p.x,
    y: p.y,
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <ScatterChart margin={{ top: 8, right: 12, bottom: 16, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          type="number"
          dataKey="x"
          name={evidence.xLabel || "x"}
          {...AXIS}
          label={{
            value: evidence.xLabel,
            position: "insideBottom",
            offset: -8,
            fontSize: 11,
            fill: "hsl(var(--muted-foreground))",
          }}
        />
        <YAxis
          type="number"
          dataKey="y"
          name={evidence.yLabel || "y"}
          {...AXIS}
          width={54}
        />
        <ZAxis range={[36, 36]} />
        <Tooltip content={<ChartTooltip unit={unit} />} cursor={{ strokeDasharray: "3 3" }} />
        <Scatter data={points} fill="hsl(var(--brand))" fillOpacity={0.65} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

/** Day-of-week and other categorical findings: small-multiple bars. */
function CategoricalChart({ evidence, unit }) {
  const data = (evidence.groups ?? []).map((g) => ({
    label: g.label?.slice(0, 3) ?? "",
    full: g.label,
    median: unit === "paisa" ? fromMinorUnits(g.median ?? 0) : g.median ?? 0,
    n: g.n,
    isPeak: g.isPeak,
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey="label" {...AXIS} interval={0} />
        <YAxis {...AXIS} width={54} tickFormatter={(v) => compact(v, unit)} />
        <Tooltip
          content={<ChartTooltip unit={unit === "paisa" ? "rupees" : unit} labelKey="full" />}
          cursor={{ fill: "hsl(var(--accent))", opacity: 0.35 }}
        />
        <Bar dataKey="median" name="Typical day" radius={[6, 6, 0, 0]}>
          {data.map((row, i) => (
            <Cell
              key={i}
              fill={row.isPeak ? "hsl(var(--brand))" : "hsl(var(--muted-foreground))"}
              fillOpacity={row.isPeak ? 1 : 0.45}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** The right chart for the evidence's shape. */
export function EvidenceChart({ insight, className }) {
  const evidence = insight?.evidence;
  const unit = insight?.effect?.unit;
  if (!evidence?.kind) return null;

  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <div className="min-w-[280px]">
        {evidence.kind === "two_group" && <TwoGroupChart evidence={evidence} unit={unit} />}
        {evidence.kind === "correlation" && <CorrelationChart evidence={evidence} unit={unit} />}
        {evidence.kind === "categorical" && <CategoricalChart evidence={evidence} unit={unit} />}
      </div>
    </div>
  );
}

/**
 * How the finding's strength has moved across runs.
 *
 * Shown openly, including the wobble. A pattern whose strength has been
 * stable for six weeks and one that has bounced around are different
 * things, and the user is entitled to tell them apart.
 */
export function StrengthHistoryChart({ history, className }) {
  if (!history?.length || history.length < 2) return null;
  const data = history.map((h) => ({
    date: h.date ? new Date(h.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "",
    value: Math.abs(Number(h.value ?? 0)),
  }));

  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <div className="min-w-[280px]">
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="date" {...AXIS} />
            <YAxis {...AXIS} width={40} domain={[0, 1]} />
            <Tooltip content={<ChartTooltip unit="effect" />} />
            <Line
              type="monotone"
              dataKey="value"
              name="Strength"
              stroke="hsl(var(--brand))"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/**
 * The card-sized glance at the evidence.
 *
 * Hand-drawn SVG rather than recharts: a feed can hold half a dozen of
 * these, and none of them needs axes, tooltips or a chart runtime to say
 * "these two groups differ by about this much".
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

/** Long group labels don't fit an axis tick. */
function shorten(label) {
  return label?.length > 18 ? `${label.slice(0, 17)}…` : label;
}

/** Compact axis numbers — "12k" beats "12,000" in 54 pixels. */
function compact(value, unit) {
  if (unit === "mood_points") return Number(value).toFixed(1);
  const n = Number(value) || 0;
  if (Math.abs(n) >= 1000) return `${Math.round(n / 1000)}k`;
  return Math.round(n);
}
