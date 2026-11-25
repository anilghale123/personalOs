"use client";

import * as React from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Loader2,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  dayScore,
  dateKeyForDay,
  dayNumberFor,
  isLoggable,
  leafValue,
  targetFor,
  topLevelTrackers,
  valuesForLog,
} from "@/features/challenge/utils";
import { SetsInput } from "./sets-input";

/**
 * The daily log screen.
 *
 * It shows one day at a time (arrows move between days, blocked for the
 * future), every tracker as a row with its target, its input (a number, set
 * chips, or a yes/no), and a delta against the previous logged day. Rollup
 * parents are read-only totals. The day score in the header updates live as
 * you type.
 *
 * Saving is explicit (one Save button) and posts the whole day to
 * PUT /logs/[date]; the server re-derives values, snapshots targets and
 * calibrates any first-time baseline.
 */
export function DayLogger({ challenge, refreshKey, onChanged }) {
  const [todayKey, setTodayKey] = React.useState(null);
  const currentDayNum = todayKey
    ? Math.min(challenge.totalDays, Math.max(1, dayNumberFor(challenge, todayKey)))
    : 1;

  const [day, setDay] = React.useState(
    () => Math.min(challenge.totalDays, Math.max(1, currentDayNum))
  );
  const [logs, setLogs] = React.useState({ current: null, previous: null });
  const [draft, setDraft] = React.useState({});
  const [saving, setSaving] = React.useState(false);

  // The clock is read in the browser (the route is prerendered).
  React.useEffect(() => {
    const now = new Date();
    setTodayKey(
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
        now.getDate()
      ).padStart(2, "0")}`
    );
  }, []);

  const dateKey = dateKeyForDay(challenge, day);

  // Load the day and the day before whenever the day (or a parent write)
  // changes. A write that calibrates a baseline changes the targets, so the
  // parent bumps refreshKey and we re-read.
  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      const fromKey = dateKeyForDay(challenge, Math.max(1, day - 1));
      const res = await fetch(
        `/api/challenges/${challenge._id}/logs?from=${fromKey}&to=${dateKey}`
      );
      if (!res.ok) return;
      const list = (await res.json()) || [];
      if (cancelled) return;
      const current = list.find((l) => l.date === dateKey) || null;
      const previous = list.find((l) => l.dayNumber === day - 1) || null;
      setLogs({ current, previous });
      setDraft(entriesToDraft(current));
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [challenge, day, dateKey, refreshKey]);

  const prevValues = React.useMemo(
    () => (logs.previous ? valuesForLog(challenge, logs.previous) : new Map()),
    [challenge, logs.previous]
  );

  // The live day score, recomputed from the draft against the current ramp.
  const liveScore = React.useMemo(() => {
    const entries = Object.entries(draft)
      .filter(([, e]) => e.value != null || e.done)
      .map(([trackerId, e]) => {
        const tracker = challenge.trackers.find((t) => String(t._id) === trackerId);
        return {
          trackerId,
          value: e.value,
          sets: e.sets,
          done: e.done,
          target: tracker ? targetFor(challenge, tracker, day) : null,
        };
      });
    return dayScore(challenge, { dayNumber: day, date: dateKey, entries });
  }, [draft, challenge, day, dateKey]);

  const isFuture = todayKey != null && dateKey > todayKey;
  const isToday = todayKey != null && dateKey === todayKey;

  function setEntry(trackerId, patch) {
    setDraft((d) => ({
      ...d,
      [trackerId]: {
        value: null,
        sets: null,
        done: false,
        ...(d[trackerId] || {}),
        ...patch,
      },
    }));
  }

  function copyYesterday() {
    if (!logs.previous) return;
    const next = {};
    for (const e of logs.previous.entries || []) {
      next[String(e.trackerId)] = {
        value: e.value,
        sets: e.sets ? [...e.sets] : null,
        done: Boolean(e.done),
      };
    }
    setDraft(next);
  }

  async function save() {
    setSaving(true);
    try {
      const entries = Object.entries(draft)
        .filter(([, e]) => e.value != null || e.done)
        .map(([trackerId, e]) => ({
          trackerId,
          value: e.value ?? null,
          sets: e.sets ?? undefined,
          done: Boolean(e.done),
        }));
      const res = await fetch(
        `/api/challenges/${challenge._id}/logs/${dateKey}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entries }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not save the day.");
      }
      toast.success(`Day ${day} saved.`);
      onChanged?.();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Day header */}
      <div className="flex items-center gap-2 rounded-2xl bg-card elev-sm p-3">
        <Button
          variant="outline"
          size="icon"
          aria-label="Previous day"
          onClick={() => setDay((d) => Math.max(1, d - 1))}
          disabled={day <= 1}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1 text-center">
          <p className="font-display text-lg leading-tight">
            Day {day}
            <span className="text-muted-foreground"> / {challenge.totalDays}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {isToday ? "Today" : isFuture ? "Future day" : "Past day"}
          </p>
        </div>
        <div className="w-24 text-right">
          <p className="text-xs text-muted-foreground">Day score</p>
          <p className="font-display text-lg tabular-nums">
            {logs.current ? liveScore : isFuture ? "—" : "0"}
            <span className="text-sm text-muted-foreground">%</span>
          </p>
        </div>
        <Button
          variant="outline"
          size="icon"
          aria-label="Next day"
          onClick={() => setDay((d) => Math.min(currentDayNum, d + 1))}
          disabled={day >= currentDayNum}
        >
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      {logs.current && (
        <Button
          variant="outline"
          size="sm"
          onClick={copyYesterday}
          className="w-full"
          disabled={!logs.previous}
        >
          <Copy className="h-4 w-4" />
          Copy yesterday&apos;s values
        </Button>
      )}

      {/* The tracker rows */}
      <div className="space-y-2">
        {topLevelTrackers(challenge).map((t) => (
          <TrackerRow
            key={String(t._id)}
            challenge={challenge}
            tracker={t}
            day={day}
            draft={draft}
            onEntry={setEntry}
            prevValues={prevValues}
            depth={0}
          />
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {challenge.trackers.filter((t) => isLoggable(challenge, t)).length}{" "}
          things to log
        </p>
        <Button onClick={save} disabled={saving || isFuture}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saving ? "Saving" : `Save day ${day}`}
        </Button>
      </div>
    </div>
  );
}

/** Turn a saved log's entries into the draft shape the editor uses. */
function entriesToDraft(log) {
  const out = {};
  if (!log) return out;
  for (const e of log.entries || []) {
    out[String(e.trackerId)] = {
      value: e.value,
      sets: e.sets ? [...e.sets] : null,
      done: Boolean(e.done),
    };
  }
  return out;
}

/**
 * One tracker row plus, nested beneath it, its children.
 *
 * A rollup parent is read-only (its value is the sum of its children).
 * Everything else gets an input matching its metric: a yes/no for `check`,
 * set chips for a set tracker, or a number otherwise.
 */
function TrackerRow({
  challenge,
  tracker,
  day,
  draft,
  onEntry,
  prevValues,
  depth,
}) {
  const id = String(tracker._id);
  const children = challenge.trackers.filter(
    (t) => t.parentId && String(t.parentId) === id
  );
  const isRollup = tracker.rollup;
  const entry = draft[id] || { value: null, sets: null, done: false };

  const target = targetFor(challenge, tracker, day);
  const calibration =
    !isRollup &&
    tracker.baseline == null &&
    tracker.goal != null &&
    day === (tracker.startDay || 1);

  let value;
  if (isRollup) {
    const any = children.some((c) => {
      const ce = draft[String(c._id)];
      return ce && leafValue(ce, c) != null;
    });
    value = any
      ? children.reduce((sum, c) => {
          const ce = draft[String(c._id)];
          const v = ce ? leafValue(ce, c) : null;
          return sum + (v ?? 0);
        }, 0)
      : null;
  } else {
    value = leafValue(entry, tracker);
  }

  const prev = prevValues.get(id);
  const delta = value != null && prev != null && !isRollup ? value - prev : null;
  const unit = tracker.unit ? ` ${tracker.unit}` : "";

  return (
    <div
      className={cn(
        "rounded-xl bg-card elev-sm p-3",
        depth > 0 && "ml-4 border-l-2"
      )}
    >
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p
              className={cn(
                "truncate text-sm font-medium",
                depth > 0 && "font-normal"
              )}
            >
              {tracker.name}
            </p>
            <TargetBadge
              target={target}
              calibration={calibration}
              value={value}
              unit={unit}
            />
          </div>
          <div className="mt-2">
            {isRollup ? (
              <ReadOnlyTotal value={value} unit={unit} />
            ) : tracker.metric === "check" ? (
              <CheckToggle
                done={entry.done}
                onChange={(done) => onEntry(id, { done, value: done ? 1 : 0 })}
              />
            ) : tracker.useSets ? (
              <SetsInput
                value={entry.sets || []}
                onChange={(sets) =>
                  onEntry(id, {
                    sets,
                    value: sets.length
                      ? sets.reduce((a, b) => a + b, 0)
                      : null,
                  })
                }
                unit={tracker.unit}
              />
            ) : (
              <ValueInput
                value={entry.value}
                onChange={(v) => onEntry(id, { value: v })}
                unit={tracker.unit}
              />
            )}
          </div>
        </div>

        <DeltaBadge delta={delta} />
      </div>

      {children.length > 0 && (
        <div className="mt-2 space-y-2">
          {children.map((c) => (
            <TrackerRow
              key={String(c._id)}
              challenge={challenge}
              tracker={c}
              day={day}
              draft={draft}
              onEntry={onEntry}
              prevValues={prevValues}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TargetBadge({ target, calibration, value, unit }) {
  if (calibration) {
    return (
      <span className="shrink-0 rounded-full bg-amber-200 px-2 py-0.5 text-[11px] font-medium text-amber-900">
        Calibration day
      </span>
    );
  }
  if (target == null) {
    return (
      <span className="shrink-0 text-[11px] text-muted-foreground">
        Target —
      </span>
    );
  }
  const met = value != null && value >= target;
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums",
        value == null
          ? "bg-muted text-muted-foreground"
          : met
          ? "bg-sage-200 text-sage-900"
          : "bg-muted text-foreground"
      )}
    >
      Target {target}
      {value != null && (
        <span className="ml-1 opacity-70">
          {value}
          {unit}
        </span>
      )}
    </span>
  );
}

function ReadOnlyTotal({ value, unit }) {
  return (
    <div className="flex h-9 items-center rounded-md bg-muted/50 px-3 text-sm tabular-nums text-muted-foreground">
      {value == null ? "Total of items below" : `${value}${unit}`}
    </div>
  );
}

function CheckToggle({ done, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={done}
      onClick={() => onChange(!done)}
      className={cn(
        "flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors",
        done
          ? "border-sage-400 bg-sage-200 text-sage-900"
          : "border bg-background text-muted-foreground hover:bg-accent"
      )}
    >
      <span
        className={cn(
          "flex h-5 w-5 items-center justify-center rounded-md border",
          done
            ? "border-sage-600 bg-sage-600 text-white"
            : "border-muted-foreground/40"
        )}
      >
        {done && <Check className="h-3.5 w-3.5" />}
      </span>
      {done ? "Done" : "Mark done"}
    </button>
  );
}

function ValueInput({ value, onChange, unit }) {
  return (
    <div className="flex items-center gap-1.5">
      <Input
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        value={value ?? ""}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === "" ? null : Number(raw));
        }}
        className="h-9 w-24 bg-background text-sm"
      />
      {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
    </div>
  );
}

function DeltaBadge({ delta }) {
  if (delta == null) return <span className="w-10" />;
  const up = delta >= 0;
  return (
    <span
      className={cn(
        "shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
        up ? "bg-sage-200 text-sage-900" : "bg-red-200 text-red-900"
      )}
      title="vs the previous logged day"
    >
      {up ? "+" : ""}
      {Number.isInteger(delta) ? delta : delta.toFixed(1)}
    </span>
  );
}
