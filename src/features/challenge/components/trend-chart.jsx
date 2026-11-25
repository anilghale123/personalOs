"use client";

import * as React from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { targetFor } from "@/features/challenge/utils";

/**
 * One tracker over the whole challenge:
 *
 *   - a solid line for the actual logged values
 *   - a muted line for the target ramp
 *   - a dashed line for the pace projection, fitted over the last 14 logged
 *     days and extended to the final day
 *
 * `logs` are the challenge's day logs; `pace` is the tracker's pace result
 * (slope/intercept/status) from challengeStats. Missing days are gaps in the
 * actual line (recharts `connectNulls` is off, so a skipped day shows as one).
 */
export function TrendChart({ challenge, trackerId, logs, pace }) {
  const tracker = challenge.trackers.find(
    (t) => String(t._id) === trackerId
  );
  const N = challenge.totalDays;

  const data = React.useMemo(() => {
    const valueByDay = new Map();
    for (const log of logs || []) {
      for (const e of log.entries || []) {
        if (String(e.trackerId) === trackerId && e.value != null) {
          valueByDay.set(log.dayNumber, e.value);
        }
      }
    }
    // A rollup's actual value is the sum of its children's entries.
    if (tracker?.rollup) {
      const kids = challenge.trackers.filter(
        (c) => c.parentId && String(c.parentId) === trackerId
      );
      for (const log of logs || []) {
        let sum = 0;
        let any = false;
        for (const k of kids) {
          for (const e of log.entries || []) {
            if (String(e.trackerId) === String(k._id) && e.value != null) {
              sum += e.value;
              any = true;
            }
          }
        }
        if (any) valueByDay.set(log.dayNumber, sum);
      }
    }

    // The fit window: the last 14 days that have a value.
    const days = [...valueByDay.keys()].sort((a, b) => a - b);
    const windowStart = days.length
      ? days[Math.max(0, days.length - 14)]
      : null;

    const out = [];
    for (let d = 1; d <= N; d += 1) {
      const actual = valueByDay.has(d) ? valueByDay.get(d) : null;
      const target = targetFor(challenge, tracker, d);
      let proj = null;
      if (pace && pace.slope != null && windowStart && d >= windowStart) {
        proj = Math.round(pace.intercept + pace.slope * d);
      }
      out.push({ day: d, actual, target, proj });
    }
    return out;
  }, [challenge, tracker, trackerId, logs, pace, N]);

  const unit = tracker?.unit;

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="hsl(var(--border))"
            vertical={false}
          />
          <XAxis
            dataKey="day"
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            tickFormatter={(d) => `d${d}`}
          />
          <YAxis
            width={36}
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            domain={["dataMin", "dataMax"]}
          />
          <Tooltip
            labelFormatter={(d) => `Day ${d}`}
            formatter={(value, name) => [
              value == null ? "—" : `${value}${unit ? " " + unit : ""}`,
              name === "actual"
                ? "Logged"
                : name === "target"
                ? "Target"
                : "Projection",
            ]}
            contentStyle={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 12,
              fontSize: 12,
            }}
          />
          <Line
            dataKey="target"
            name="target"
            stroke="hsl(var(--muted-foreground))"
            strokeOpacity={0.5}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            dataKey="proj"
            name="proj"
            stroke="hsl(var(--primary))"
            strokeDasharray="4 4"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            dataKey="actual"
            name="actual"
            stroke="hsl(var(--brand))"
            strokeWidth={2}
            dot={{ r: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
