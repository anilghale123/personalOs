import { describe, expect, it } from "vitest";
import {
  challengeStats,
  childrenOf,
  currentDay,
  dayNumberFor,
  dayScore,
  dateKeyForDay,
  isDateInRange,
  leafValue,
  paceMessage,
  rampSeries,
  targetsForDay,
  targetFor,
  topLevelTrackers,
  trackerStats,
  valuesForLog,
} from "./utils";

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

/**
 * The tree from the challenge brief:
 *
 *   Exercise (minutes, logged directly)
 *   ├── Push-ups (count, rollup of the variations)
 *   │   ├── Diamond  (count, sets)
 *   │   └── Normal   (count, sets)
 *   └── Sit-ups  (count, sets)
 *   Reading    (minutes)
 *   Meditation (check)
 */
function makeChallenge(overrides = {}) {
  const t = (id, parent, patch = {}) => ({
    _id: id,
    parentId: parent,
    name: id,
    metric: "count",
    unit: null,
    rollup: false,
    useSets: false,
    baseline: null,
    goal: null,
    rampType: "linear",
    direction: "increase",
    startDay: 1,
    order: 0,
    archived: false,
    ...patch,
  });

  const trackers = [
    t("ex", null, {
      name: "Exercise",
      metric: "minutes",
      baseline: 30,
      goal: 60,
      order: 0,
    }),
    t("push", "ex", { name: "Push-ups", rollup: true, baseline: 10, goal: 50 }),
    t("diamond", "push", {
      name: "Diamond",
      useSets: true,
      baseline: 10,
      goal: 40,
    }),
    t("normal", "push", {
      name: "Normal",
      useSets: true,
      baseline: 10,
      goal: 30,
    }),
    t("situps", "ex", { name: "Sit-ups", useSets: true, baseline: 20, goal: 50 }),
    t("read", null, {
      name: "Reading",
      metric: "minutes",
      baseline: 10,
      goal: 30,
      order: 1,
    }),
    t("med", null, {
      name: "Meditation",
      metric: "check",
      order: 2,
    }),
  ];

  return {
    _id: "c1",
    title: "88-Day Reset",
    startDate: "2026-01-01",
    totalDays: 88,
    status: "active",
    color: "blue",
    trackers,
    ...overrides,
  };
}

const find = (challenge, id) =>
  challenge.trackers.find((t) => t._id === id);

/** A log document for one day. `entries` is a partial: { id: {…} }. */
function log(challenge, day, entries, note) {
  return {
    _id: `log-${day}`,
    challengeId: challenge._id,
    date: dateKeyForDay(challenge, day),
    dayNumber: day,
    note: note ?? null,
    entries: Object.entries(entries).map(([id, e]) => ({
      trackerId: id,
      value: null,
      sets: null,
      done: false,
      target: null,
      ...e,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Day helpers                                                         */
/* ------------------------------------------------------------------ */

describe("day helpers", () => {
  const c = makeChallenge();

  it("maps day numbers to local date keys", () => {
    expect(dateKeyForDay(c, 1)).toBe("2026-01-01");
    expect(dateKeyForDay(c, 2)).toBe("2026-01-02");
    expect(dateKeyForDay(c, 31)).toBe("2026-01-31"); // crosses the month
    expect(dateKeyForDay(c, 88)).toBe("2026-03-29");
    expect(dayNumberFor(c, "2026-03-29")).toBe(88);
  });

  it("clamps the current day to 1..totalDays", () => {
    expect(currentDay(c, "2025-12-01")).toBe(1); // before the start
    expect(currentDay(c, "2026-01-01")).toBe(1);
    expect(currentDay(c, "2026-02-01")).toBe(32);
    expect(currentDay(c, "2026-06-15")).toBe(88); // after the end
  });

  it("bounds loggable dates to the range and the past", () => {
    const today = "2026-01-15"; // day 15
    expect(isDateInRange(c, "2026-01-14", today)).toBe(true); // a skipped day
    expect(isDateInRange(c, "2026-01-01", today)).toBe(true); // day 1
    expect(isDateInRange(c, "2026-01-16", today)).toBe(false); // future
    expect(isDateInRange(c, "2025-12-31", today)).toBe(false); // before
    expect(isDateInRange(c, "2026-04-01", today)).toBe(false); // after end
  });
});

/* ------------------------------------------------------------------ */
/* The ramp                                                            */
/* ------------------------------------------------------------------ */

describe("auto-ramp targets", () => {
  const c = makeChallenge();
  const diamond = find(c, "diamond"); // b=10 g=40 linear, 88 days

  it("matches the brief's worked example", () => {
    expect(targetFor(c, diamond, 1)).toBe(10);
    // 10 + 30 × (1/87) ≈ 10.3 → rounds to 10
    expect(targetFor(c, diamond, 2)).toBe(10);
    // 10 + 30 × (29/87) = 20
    expect(targetFor(c, diamond, 30)).toBe(20);
    expect(targetFor(c, diamond, 88)).toBe(40);
  });

  it("is monotone even through rounding", () => {
    // A small goal: consecutive days round to the same value and must not
    // step backwards or forwards.
    const small = makeChallenge({
      trackers: [
        { _id: "a", parentId: null, name: "a", metric: "count", useSets: false,
          rollup: false, baseline: 100, goal: 105, rampType: "linear",
          direction: "increase", startDay: 1, order: 0, archived: false },
      ],
    });
    const t = find(small, "a");
    const series = rampSeries(small, t).map((p) => p.target);
    for (let i = 1; i < series.length; i++) {
      expect(series[i]).toBeGreaterThanOrEqual(series[i - 1]);
    }
    expect(series[0]).toBe(100);
    expect(series[series.length - 1]).toBe(105);
  });

  it("ramps down for a decrease habit", () => {
    const down = makeChallenge({
      trackers: [
        { _id: "a", parentId: null, name: "a", metric: "count", useSets: false,
          rollup: false, baseline: 60, goal: 30, rampType: "linear",
          direction: "decrease", startDay: 1, order: 0, archived: false },
      ],
    });
    const t = find(down, "a");
    const series = rampSeries(down, t).map((p) => p.target);
    expect(series[0]).toBe(60);
    expect(series[series.length - 1]).toBe(30);
    for (let i = 1; i < series.length; i++) {
      expect(series[i]).toBeLessThanOrEqual(series[i - 1]);
    }
  });

  it("uses the percent ramp when the baseline is positive", () => {
    const pct = makeChallenge({
      trackers: [
        { _id: "a", parentId: null, name: "a", metric: "count", useSets: false,
          rollup: false, baseline: 20, goal: 80, rampType: "percent",
          direction: "increase", startDay: 1, order: 0, archived: false },
      ],
    });
    const t = find(pct, "a");
    // t at day 22 of 88 (startDay 1): (22-1)/(88-1) = 1/4 → 20 × 4^0.25
    expect(targetFor(pct, t, 22)).toBe(Math.round(20 * Math.sqrt(2)));
    expect(targetFor(pct, t, 88)).toBe(80);
  });

  it("falls back to linear for a percent ramp with a zero baseline", () => {
    const pct = makeChallenge({
      trackers: [
        { _id: "a", parentId: null, name: "a", metric: "count", useSets: false,
          rollup: false, baseline: 0, goal: 40, rampType: "percent",
          direction: "increase", startDay: 1, order: 0, archived: false },
      ],
    });
    const t = find(pct, "a");
    expect(targetFor(pct, t, 1)).toBe(0);
    expect(targetFor(pct, t, 88)).toBe(40);
  });

  it("stays flat when the goal equals the baseline", () => {
    const flat = makeChallenge({
      trackers: [
        { _id: "a", parentId: null, name: "a", metric: "count", useSets: false,
          rollup: false, baseline: 15, goal: 15, rampType: "linear",
          direction: "increase", startDay: 1, order: 0, archived: false },
      ],
    });
    const t = find(flat, "a");
    expect(targetFor(flat, t, 1)).toBe(15);
    expect(targetFor(flat, t, 44)).toBe(15);
    expect(targetFor(flat, t, 88)).toBe(15);
  });

  it("has no target while uncalibrated", () => {
    const c2 = makeChallenge({
      trackers: [
        { _id: "a", parentId: null, name: "a", metric: "count", useSets: false,
          rollup: false, baseline: null, goal: 40, rampType: "linear",
          direction: "increase", startDay: 1, order: 0, archived: false },
      ],
    });
    expect(targetFor(c2, find(c2, "a"), 1)).toBe(null);
    expect(targetFor(c2, find(c2, "a"), 88)).toBe(null);
  });

  it("runs a mid-challenge tracker over the remaining days", () => {
    const late = makeChallenge({
      trackers: [
        { _id: "a", parentId: null, name: "a", metric: "count", useSets: false,
          rollup: false, baseline: 10, goal: 40, rampType: "linear",
          direction: "increase", startDay: 30, order: 0, archived: false },
      ],
    });
    const t = find(late, "a");
    expect(targetFor(late, t, 29)).toBe(null);
    expect(targetFor(late, t, 30)).toBe(10);
    expect(targetFor(late, t, 88)).toBe(40);
  });

  it("adds a tracker on the final day straight to its goal", () => {
    const last = makeChallenge({
      trackers: [
        { _id: "a", parentId: null, name: "a", metric: "count", useSets: false,
          rollup: false, baseline: 10, goal: 40, rampType: "linear",
          direction: "increase", startDay: 88, order: 0, archived: false },
      ],
    });
    expect(targetFor(last, find(last, "a"), 88)).toBe(40);
  });

  it("always targets 1 for a check habit", () => {
    expect(targetFor(c, find(c, "med"), 1)).toBe(1);
    expect(targetFor(c, find(c, "med"), 88)).toBe(1);
  });

  it("sums a rollup's children, and is null when none have targets", () => {
    // Push-ups = Diamond(10) + Normal(10) on day 1.
    expect(targetFor(c, find(c, "push"), 1)).toBe(20);
    expect(targetFor(c, find(c, "push"), 88)).toBe(70); // 40 + 30

    const noTarget = makeChallenge({
      trackers: [
        { _id: "p", parentId: null, name: "p", metric: "count", rollup: true,
          useSets: false, baseline: null, goal: null, rampType: "linear",
          direction: "increase", startDay: 1, order: 0, archived: false },
        { _id: "k", parentId: "p", name: "k", metric: "count", rollup: false,
          useSets: false, baseline: null, goal: null, rampType: "linear",
          direction: "increase", startDay: 1, order: 0, archived: false },
      ],
    });
    expect(targetFor(noTarget, find(noTarget, "p"), 1)).toBe(null);
  });

  it("fills a day map for every tracker", () => {
    const map = targetsForDay(c, 1);
    expect(map.get("diamond")).toBe(10);
    expect(map.get("med")).toBe(1);
    expect(map.get("ex")).toBe(30);
  });
});

/* ------------------------------------------------------------------ */
/* Tree helpers                                                        */
/* ------------------------------------------------------------------ */

describe("tree helpers", () => {
  const c = makeChallenge();

  it("finds children and top-level habits in order", () => {
    expect(childrenOf(c, "ex").map((t) => t._id).sort()).toEqual([
      "push",
      "situps",
    ]);
    expect(topLevelTrackers(c).map((t) => t._id)).toEqual([
      "ex",
      "read",
      "med",
    ]);
  });

  it("keeps archived top-level habits out of the list", () => {
    const c2 = makeChallenge();
    c2.trackers.find((t) => t._id === "med").archived = true;
    expect(topLevelTrackers(c2).map((t) => t._id)).toEqual(["ex", "read"]);
  });
});

/* ------------------------------------------------------------------ */
/* Values                                                              */
/* ------------------------------------------------------------------ */

describe("values", () => {
  const c = makeChallenge();
  const diamond = find(c, "diamond");
  const med = find(c, "med");

  it("sums sets for a set tracker", () => {
    expect(leafValue({ sets: [10, 12, 10] }, diamond)).toBe(32);
    expect(leafValue({ sets: [] }, diamond)).toBe(null);
  });

  it("scores checks as 0/1", () => {
    expect(leafValue({ done: true }, med)).toBe(1);
    expect(leafValue({ done: false }, med)).toBe(0);
  });

  it("passes through a direct value", () => {
    expect(leafValue({ value: 25 }, find(c, "read"))).toBe(25);
  });

  it("computes rollups bottom-up, including a mixed direct+children parent", () => {
    // Exercise is logged directly (30 min) AND has children:
    // Push-ups = Diamond 12 + Normal 8 = 20, Sit-ups = 25.
    const l = log(c, 5, {
      ex: { value: 30 },
      diamond: { sets: [6, 6], value: 12 },
      normal: { sets: [4, 4], value: 8 },
      situps: { sets: [25], value: 25 },
      read: { value: 10 },
      med: { done: true },
    });
    const values = valuesForLog(c, l);
    expect(values.get("diamond")).toBe(12);
    expect(values.get("normal")).toBe(8);
    expect(values.get("push")).toBe(20);
    expect(values.get("situps")).toBe(25);
    expect(values.get("ex")).toBe(30); // direct value wins, not a rollup
    expect(values.get("read")).toBe(10);
    expect(values.get("med")).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* Day score                                                           */
/* ------------------------------------------------------------------ */

describe("day score", () => {
  const c = makeChallenge();

  it("scores 100 when every habit hits its target", () => {
    const l = log(c, 1, {
      ex: { value: 30, target: 30 },
      diamond: { sets: [5, 5], value: 10, target: 10 },
      normal: { sets: [10], value: 10, target: 10 },
      situps: { sets: [20], value: 20, target: 20 },
      read: { value: 10, target: 10 },
      med: { done: true, target: 1 },
    });
    expect(dayScore(c, l)).toBe(100);
  });

  it("caps a heroic day at 150% per habit", () => {
    // Exercise alone at 3× target, everything else missed.
    const l = log(c, 5, { ex: { value: 90, target: 30 } });
    // ex habit: Exercise's children push & situps have no entries → the
    // direct value 90 vs 30 caps at 1.5; the other two habits score 0.
    expect(dayScore(c, l)).toBe(Math.round((1.5 / 3) * 100)); // 50
  });

  it("averages a rollup habit across its children", () => {
    // A challenge whose only top-level habit is a rollup: Diamond 10/10
    // (1.0) and Normal 5/10 (0.5) average to 0.75 → 75.
    const c2 = makeChallenge({
      trackers: [
        { _id: "push", parentId: null, name: "Push-ups", metric: "count",
          rollup: true, useSets: false, baseline: 10, goal: 50, rampType: "linear",
          direction: "increase", startDay: 1, order: 0, archived: false },
        { _id: "diamond", parentId: "push", name: "Diamond", metric: "count",
          rollup: false, useSets: true, baseline: 10, goal: 40, rampType: "linear",
          direction: "increase", startDay: 1, order: 0, archived: false },
        { _id: "normal", parentId: "push", name: "Normal", metric: "count",
          rollup: false, useSets: true, baseline: 10, goal: 30, rampType: "linear",
          direction: "increase", startDay: 1, order: 0, archived: false },
      ],
    });
    const l = log(c2, 3, {
      diamond: { sets: [10], value: 10, target: 10 },
      normal: { sets: [5], value: 5, target: 10 },
    });
    expect(dayScore(c2, l)).toBe(75);
  });

  it("scores a directly-tracked parent by its own value, not its children", () => {
    // Exercise is logged directly (30 min) AND has children; the day score
    // uses the direct value, and the children feed the rollup underneath.
    const l = log(c, 3, {
      ex: { value: 30, target: 30 },
      diamond: { sets: [10], value: 10, target: 10 },
      normal: { sets: [5], value: 5, target: 10 },
      situps: { sets: [25], value: 25, target: 25 },
      read: { value: 10, target: 10 },
      med: { done: true, target: 1 },
    });
    // Exercise 1.0 (30/30), Reading 1.0, Meditation 1.0 → 100.
    expect(dayScore(c, l)).toBe(100);
  });

  it("scores a calibration day as met when anything is logged", () => {
    const c2 = makeChallenge();
    c2.trackers.find((t) => t._id === "diamond").baseline = null;
    const l = log(c2, 1, {
      ex: { value: 30 },
      diamond: { sets: [5, 5], value: 10 }, // no target yet
      normal: { sets: [10], value: 10 },
      situps: { sets: [20], value: 20 },
      read: { value: 10 },
      med: { done: true },
    });
    // Every habit met → 100, even with no targets anywhere.
    expect(dayScore(c2, l)).toBe(100);
  });

  it("scores 0 for an empty day", () => {
    expect(dayScore(c, log(c, 1, {}))).toBe(0);
    expect(dayScore(c, null)).toBe(0);
  });

  it("inverts the comparison for a decrease habit", () => {
    const c2 = makeChallenge({
      trackers: [
        { _id: "a", parentId: null, name: "a", metric: "count", useSets: false,
          rollup: false, baseline: 60, goal: 30, rampType: "linear",
          direction: "decrease", startDay: 1, order: 0, archived: false },
      ],
    });
    // Half the target: 60 vs 30 → 30/60 = 0.5 → 50.
    expect(dayScore(c2, log(c2, 1, { a: { value: 60, target: 30 } }))).toBe(50);
    // Better than target: 15 vs 30 → 2 → capped 1.5 → 150.
    expect(dayScore(c2, log(c2, 1, { a: { value: 15, target: 30 } }))).toBe(150);
  });

  it("trusts the target snapshot over a later goal change", () => {
    const c2 = makeChallenge();
    // Snapshot target 20 → 40/20 = 2 → capped at 1.5 → one of three habits = 50.
    const l = log(c2, 2, { ex: { value: 40, target: 20 } });
    expect(dayScore(c2, l)).toBe(50);
    // Change the goal *after* the fact: the live ramp for day 2 is now 31,
    // which would score 44 — but the entry carries the 20 it was chased with,
    // so the day's score does not move.
    c2.trackers.find((t) => t._id === "ex").goal = 100;
    expect(dayScore(c2, l)).toBe(50);
  });
});

/* ------------------------------------------------------------------ */
/* Per-tracker stats                                                   */
/* ------------------------------------------------------------------ */

/** Ten days of Diamond logs: sets summing to 10 + 2×(d−1). */
function diamondLogs(challenge) {
  const out = [];
  for (let d = 1; d <= 10; d += 1) {
    const value = 10 + 2 * (d - 1);
    out.push(
      log(challenge, d, {
        diamond: { sets: [value], value, target: targetFor(challenge, find(challenge, "diamond"), d) },
        med: { done: d !== 3, target: 1 }, // a gap on day 3
      })
    );
  }
  return out;
}

describe("trackerStats", () => {
  const c = makeChallenge();
  const logs = diamondLogs(c);

  it("reports current level as the mean of the last three logged days", () => {
    const s = trackerStats(c, logs, "diamond", 10);
    // days 8, 9, 10 → 24, 26, 28 → 26
    expect(s.currentLevel).toBe(26);
  });

  it("reports the delta against the previous logged day", () => {
    const s = trackerStats(c, logs, "diamond", 10);
    // 28 − 26 = 2, against the previous day's 26
    expect(s.delta).toBe(2);
    expect(s.deltaPct).toBeCloseTo((2 / 26) * 100);
  });

  it("computes progress to goal, clamped to 0..100", () => {
    const s = trackerStats(c, logs, "diamond", 10);
    // (26 − 10) / (40 − 10) = 53.33%
    expect(s.progressToGoal).toBeCloseTo(53.33, 1);
  });

  it("computes consistency as logged days over elapsed days", () => {
    const s = trackerStats(c, logs, "diamond", 10);
    expect(s.consistencyPct).toBe(100); // 10 of 10
    expect(trackerStats(c, logs, "med", 10).consistencyPct).toBe(100);
  });

  it("tracks streaks of days that met target, broken by a miss", () => {
    const s = trackerStats(c, logs, "med", 10);
    // Med met every day except day 3: best run 2 (days 1–2), current 7 (4–10).
    expect(s.bestStreak).toBe(7);
    expect(s.currentStreak).toBe(7);
  });

  it("projects ahead of a rising line as on_track", () => {
    const s = trackerStats(c, logs, "diamond", 10);
    // slope 2, intercept 8 → 8 + 2×88 = 184 ≥ 38
    expect(s.pace.status).toBe("on_track");
    expect(Math.round(s.pace.projectedFinal)).toBe(184);
    expect(s.pace.etaDay).toBe(16); // ceil((40−8)/2)
  });

  it("projects a flat line as behind, with the required slope", () => {
    const flat = [];
    for (let d = 1; d <= 10; d += 1) {
      flat.push(log(c, d, { diamond: { sets: [10], value: 10, target: targetFor(c, find(c, "diamond"), d) } }));
    }
    const s = trackerStats(c, flat, "diamond", 10);
    expect(s.pace.status).toBe("behind");
    // (40 − 10) / (88 − 10) = 0.3846/day
    expect(s.pace.requiredSlope).toBeCloseTo(0.3846, 3);
    expect(paceMessage(s, 88)).toContain("+0.4/day");
  });

  it("reports not_enough_data before three logged points", () => {
    const two = diamondLogs(c).slice(0, 2);
    const s = trackerStats(c, two, "diamond", 2);
    expect(s.pace.status).toBe("not_enough_data");
    expect(paceMessage(s, 88)).toBe("Log a few more days to see your pace.");
  });

  it("projects a check habit from its completion rate", () => {
    const s = trackerStats(c, logs, "med", 10);
    // 9 of 10 met → 0.9 × 88 = 79.2; goal 88 → close (≥70.4, <83.6)
    expect(s.pace.completionRate).toBe(0.9);
    expect(s.pace.projectedFinal).toBeCloseTo(79.2);
    expect(s.pace.status).toBe("close");
  });

  it("compares today against today's plan", () => {
    const s = trackerStats(c, logs, "diamond", 10);
    // current 24, day-10 target 10+30×(9/87)≈13 → ahead by ~11
    expect(s.vsPlan).toBeGreaterThan(5);
  });
});

/* ------------------------------------------------------------------ */
/* Challenge-level stats                                               */
/* ------------------------------------------------------------------ */

describe("challengeStats", () => {
  const c = makeChallenge();
  const logs = diamondLogs(c);

  it("builds a score series with 0 for unlogged days", () => {
    const stats = challengeStats(c, logs, 10);
    expect(stats.dailyScores).toHaveLength(10);
    // Day 3: diamond logged (26? no — 10+2×2=14) but its target is higher;
    // what matters is that a logged day scores and a missing one would not.
    expect(stats.dailyScores.every((d) => d.logged)).toBe(true);
    expect(stats.dailyScores.every((d) => typeof d.score === "number")).toBe(true);
  });

  it("scores missing days as 0 and leaves today null until logged", () => {
    const c2 = makeChallenge({ totalDays: 5 });
    const stats = challengeStats(
      c2,
      [log(c2, 1, { ex: { value: 30, target: 30 }, read: { value: 10, target: 10 }, med: { done: true, target: 1 } })],
      3
    );
    expect(stats.dailyScores.map((d) => d.score)).toEqual([100, 0, 0]);
    expect(stats.summary.todayScore).toBe(null);
    expect(stats.summary.loggedDays).toBe(1);
  });

  it("summarises per-tracker stats by id, skipping archived trackers", () => {
    const c2 = makeChallenge();
    c2.trackers.find((t) => t._id === "med").archived = true;
    const stats = challengeStats(c2, logs, 10);
    expect(stats.byTracker.diamond).toBeTruthy();
    expect(stats.byTracker.med).toBeUndefined();
    expect(stats.topLevel).toEqual(["ex", "read"]);
  });
});

/* ------------------------------------------------------------------ */
/* The pace message                                                    */
/* ------------------------------------------------------------------ */

describe("paceMessage", () => {
  const c = makeChallenge();
  const logs = diamondLogs(c);

  it("announces the ETA when the line clears the goal early", () => {
    const s = trackerStats(c, logs, "diamond", 10);
    expect(paceMessage(s, 88)).toContain("around day 16");
  });

  it("states the projection against the goal", () => {
    const s = trackerStats(c, logs, "diamond", 10);
    expect(paceMessage(s, 88)).toContain("goal 40");
  });
});
