"use client";

import * as React from "react";
import { Flame, Target, Timer, TrendingUp } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PaceCard } from "./pace-card";
import { TrendChart } from "./trend-chart";
import { VariationBreakdown } from "./variation-breakdown";
import { ChallengeHeatmap } from "./challenge-heatmap";

/**
 * The Progress tab.
 *
 *   1. a KPI row — today's score, overall progress, consistency, streaks
 *   2. a Pace card per top-level habit
 *   3. a trend chart (actual vs target ramp vs projection) with a tracker
 *      dropdown
 *   4. the variation breakdown
 *   5. the day-score heatmap
 *
 * `stats` is the challengeStats() payload the parent already fetched (the
 * KPIs, pace and heatmap all come from it). The trend chart additionally
 * needs the raw day logs to draw the actual line, so this fetches the full
 * log range once.
 */
export function ChallengeDashboard({ challenge, stats }) {
  const [selected, setSelected] = React.useState(null);
  const [logs, setLogs] = React.useState(null);

  const trackerOptions = React.useMemo(
    () =>
      (challenge.trackers || [])
        .filter((t) => !t.archived)
        .map((t) => ({ id: String(t._id), name: t.name, top: !t.parentId })),
    [challenge]
  );

  // Default the trend picker to the first top-level habit that has logs.
  React.useEffect(() => {
    if (selected) return;
    const withLogs = trackerOptions.find((t) => stats?.byTracker?.[t.id]?.hasLogs);
    if (withLogs) setSelected(withLogs.id);
  }, [trackerOptions, stats, selected]);

  // The raw day logs, for the trend chart's actual line.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/challenges/${challenge._id}/logs`);
      if (!res.ok) return;
      const data = await res.json();
      if (!cancelled) setLogs(data || []);
    })();
    return () => {
      cancelled = true;
    };
  }, [challenge._id]);

  if (!stats) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="No progress yet"
        description="Log your first day and the pace, trends and heatmap appear here."
      />
    );
  }

  const s = stats.summary;
  const hasAnyLogs = trackerOptions.some(
    (t) => stats.byTracker[t.id]?.hasLogs
  );
  const topStats = stats.topLevel
    .map((id) => stats.byTracker[id])
    .filter(Boolean);

  return (
    <div className="space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi
          label="Today"
          value={s.todayScore != null ? `${s.todayScore}%` : "—"}
          icon={Target}
          sub={s.todayScore == null ? "not logged yet" : "day score"}
        />
        <Kpi
          label="To goal"
          value={s.overallProgress != null ? `${s.overallProgress}%` : "—"}
          icon={TrendingUp}
          sub="overall progress"
        />
        <Kpi
          label="Consistency"
          value={`${s.consistency}%`}
          icon={Timer}
          sub={`${s.loggedDays} days logged`}
        />
        <Kpi
          label="Streak"
          value={`${s.currentStreak}`}
          icon={Flame}
          sub={`best ${s.bestStreak}`}
        />
      </div>

      {!hasAnyLogs ? (
        <EmptyState
          icon={TrendingUp}
          title="Nothing logged yet"
          description="Save a day in the Today tab to start building your pace."
        />
      ) : (
        <>
          {topStats.length > 0 && (
            <section className="space-y-3">
              <SectionTitle>How you&apos;re pacing</SectionTitle>
              <div className="grid gap-3 sm:grid-cols-2">
                {topStats.map((t) => (
                  <PaceCard
                    key={t.id}
                    stats={t}
                    totalDays={challenge.totalDays}
                  />
                ))}
              </div>
            </section>
          )}

          <section className="space-y-3">
            <SectionTitle>
              <span className="flex items-center justify-between gap-2">
                Trend
                <select
                  value={selected || ""}
                  onChange={(e) => setSelected(e.target.value)}
                  className="h-7 max-w-[9rem] rounded-md border bg-background px-2 text-xs"
                  aria-label="Choose a tracker"
                >
                  {trackerOptions.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </span>
            </SectionTitle>
            <div className="rounded-2xl bg-card elev-sm p-3">
              {selected && stats.byTracker[selected] ? (
                <TrendChart
                  challenge={challenge}
                  trackerId={selected}
                  logs={logs || []}
                  pace={stats.byTracker[selected].pace}
                />
              ) : (
                <p className="flex h-56 items-center justify-center text-sm text-muted-foreground">
                  Pick a tracker to see its trend.
                </p>
              )}
              <ChartLegend />
            </div>
          </section>

          <section className="space-y-3">
            <SectionTitle>Variation breakdown</SectionTitle>
            <VariationBreakdown challenge={challenge} stats={stats.byTracker} />
          </section>

          <section className="space-y-3">
            <SectionTitle>The run so far</SectionTitle>
            <ChallengeHeatmap
              dailyScores={stats.dailyScores}
              totalDays={challenge.totalDays}
            />
          </section>
        </>
      )}
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h2>
  );
}

function Kpi({ label, value, sub, icon: Icon }) {
  return (
    <div className="rounded-2xl bg-card elev-sm p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-1.5 font-display text-2xl tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function ChartLegend() {
  const Item = ({ dashed, label, color }) => (
    <span className="flex items-center gap-1.5" style={{ color }}>
      <span
        className="inline-block h-0.5 w-4 rounded"
        style={{
          background: dashed
            ? "repeating-linear-gradient(90deg,currentColor 0 4px,transparent 4px 7px)"
            : "currentColor",
        }}
      />
      {label}
    </span>
  );
  return (
    <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px]">
      <Item label="Logged" color="hsl(var(--brand))" />
      <Item label="Target" color="hsl(var(--muted-foreground))" />
      <Item label="Projection" color="hsl(var(--primary))" dashed />
    </div>
  );
}
