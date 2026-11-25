/**
 * The challenge engine, in pure form.
 *
 * Everything here takes plain objects — a challenge document and its log
 * documents — and returns plain objects. No database, no React, no Next
 * imports. That is deliberate: the same functions run in the API route that
 * computes stats server-side and in the browser that previews a ramp before
 * a challenge is saved, and a pure module is the only shape that is testable
 * in both places at once.
 *
 * The shape of the inputs is what the models produce after `.lean()`:
 *
 *   challenge = {
 *     startDate: 'YYYY-MM-DD', totalDays: 88,
 *     trackers: [ { _id, parentId, name, metric, unit, rollup, useSets,
 *                   baseline, goal, rampType, direction, startDay, archived } ]
 *   }
 *   log = { date: 'YYYY-MM-DD', dayNumber: 12,
 *           entries: [ { trackerId, value, sets, done, target } ] }
 *
 * Tracker ids are compared as **strings** throughout, so a `_id` may be a
 * real ObjectId (from the API) or a plain string (in a test) and both work.
 */

import {
  addDays,
  differenceInCalendarDays,
  format,
  parseISO,
} from "date-fns";

/* ------------------------------------------------------------------ */
/* Day helpers                                                         */
/* ------------------------------------------------------------------ */

/** 'YYYY-MM-DD' for the day `n` of a challenge (1 = startDate). */
export function dateKeyForDay(challenge, n) {
  return format(addDays(parseISO(challenge.startDate), (n || 1) - 1), "yyyy-MM-dd");
}

/** The last day of a challenge, as a 'YYYY-MM-DD' key. */
export function endDateFor(challenge) {
  return dateKeyForDay(challenge, challenge.totalDays);
}

/** 1-based day number of a date key within a challenge. */
export function dayNumberFor(challenge, dateKey) {
  return differenceInCalendarDays(parseISO(dateKey), parseISO(challenge.startDate)) + 1;
}

/** Local 'YYYY-MM-DD' for a Date (the viewer's calendar date, never UTC). */
export function localDateKey(d = new Date()) {
  return format(d, "yyyy-MM-dd");
}

/**
 * Which day of the challenge it is now, clamped to 1..totalDays.
 *
 * `today` is a date key (the viewer's, built with the same local-date rule as
 * weekStartKey) or a Date. Days before the start clamp to 1; days after the
 * end clamp to totalDays — so an old challenge still reads as "day N of N".
 */
export function currentDay(challenge, today) {
  const key = typeof today === "string" ? today : localDateKey(today);
  const day = dayNumberFor(challenge, key);
  return Math.max(1, Math.min(challenge.totalDays, day));
}

/**
 * The status a challenge should show right now.
 *
 * An active challenge whose last day has passed is completed — decided at
 * read time from the clock rather than by a cron, so it is always true even
 * if nothing has written to the document since. The write routes persist this
 * when it changes; reads just compute it.
 */
export function effectiveStatus(challenge, todayKey) {
  if (challenge.status !== "active") return challenge.status;
  if (todayKey != null && todayKey > endDateFor(challenge)) return "completed";
  return challenge.status;
}

/**
 * Is a date key loggable for this challenge?
 *
 * It must fall within days 1..totalDays, and — when `todayKey` is given —
 * not be a future day. The "not in the future" half is the guard the logger
 * and the upsert route both need; it is passed in (rather than read from the
 * clock) so the function stays pure and testable.
 */
export function isDateInRange(challenge, dateKey, todayKey) {
  const day = dayNumberFor(challenge, dateKey);
  if (day < 1 || day > challenge.totalDays) return false;
  if (todayKey != null) return dateKey <= todayKey;
  return true;
}

/* ------------------------------------------------------------------ */
/* Tree helpers (the trackers are a flat list linked by parentId)      */
/* ------------------------------------------------------------------ */

function key(t) {
  return String(t._id);
}

/** Every tracker whose parentId is `trackerId`. */
export function childrenOf(challenge, trackerId) {
  const wanted = String(trackerId);
  return (challenge.trackers || []).filter(
    (t) => t.parentId && String(t.parentId) === wanted
  );
}

/** Top-level habits: no parent, not archived. In `order`, then name. */
export function topLevelTrackers(challenge) {
  return (challenge.trackers || [])
    .filter((t) => !t.parentId && !t.archived)
    .sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name));
}

/** A tracker with no children of its own. */
export function isLeaf(challenge, tracker) {
  return childrenOf(challenge, tracker._id).length === 0;
}

/**
 * Is this tracker loggable directly?
 *
 * A rollup is never logged — its value is the sum of its children. Everything
 * else (a leaf, or a parent that is tracked separately *and* has children,
 * like "Exercise" total minutes with push-ups underneath) is logged directly.
 */
export function isLoggable(challenge, tracker) {
  return !tracker.rollup && !tracker.archived;
}

/* ------------------------------------------------------------------ */
/* Targets: the auto-ramp                                              */
/* ------------------------------------------------------------------ */

/**
 * The raw ramp target for one leaf tracker on one day, before rounding is
 * enforced monotone. Returns null when the tracker has no target for that
 * day: it has not started yet (day < startDay), or it is still in
 * calibration (baseline is null), or it has no goal to ramp toward.
 */
function naturalLeafTarget(challenge, tracker, day) {
  const s = tracker.startDay || 1;
  if (day < s) return null;
  if (tracker.baseline == null || tracker.goal == null) return null;

  const b = tracker.baseline;
  const g = tracker.goal;
  const N = challenge.totalDays;
  // t runs 0 (its first day) → 1 (the last). A tracker added on the final
  // day has N === s and is at its goal immediately.
  const t = N === s ? 1 : (day - s) / (N - s);

  let raw;
  if (tracker.rampType === "percent" && b > 0) {
    raw = b * Math.pow(g / b, t);
  } else {
    // Linear, and the fallback for a percent ramp with b <= 0.
    raw = b + (g - b) * t;
  }
  return Math.round(raw);
}

/**
 * The full ramp for one leaf tracker: an array indexed by day (index `d-1`
 * is day `d`), each entry the target for that day or null.
 *
 * Monotonicity is enforced across the whole sequence: a target must never
 * move against the habit's direction as the days go on. Math.round is itself
 * monotone and the raw ramp is, so this only bites when a `direction`
 * disagrees with the sign of goal-minus-baseline — there it keeps the ramp
 * from stepping backwards day to day.
 */
function leafRampSeries(challenge, tracker) {
  const N = challenge.totalDays;
  const s = tracker.startDay || 1;
  const dir = tracker.direction === "decrease" ? -1 : 1;
  const series = new Array(N).fill(null);
  let prev = null;
  for (let d = s; d <= N; d += 1) {
    const raw = naturalLeafTarget(challenge, tracker, d);
    if (raw == null) {
      series[d - 1] = null;
      continue;
    }
    const v =
      dir === 1 ? Math.max(raw, prev ?? raw) : Math.min(raw, prev ?? raw);
    series[d - 1] = v;
    prev = v;
  }
  return series;
}

/**
 * The ramp target for any tracker on a given day.
 *
 * A rollup is the sum of its children's targets (a parent whose children
 * have no targets has none itself). A `check` habit always targets 1.
 * Anything else is a leaf ramp.
 */
export function targetFor(challenge, tracker, day) {
  if (!tracker || day == null || day < 1) return null;

  if (tracker.rollup) {
    let sum = 0;
    let any = false;
    for (const child of childrenOf(challenge, tracker._id)) {
      const t = targetFor(challenge, child, day);
      if (t != null) {
        sum += t;
        any = true;
      }
    }
    return any ? sum : null;
  }

  if (tracker.metric === "check") return 1;

  return leafRampSeries(challenge, tracker)[day - 1] ?? null;
}

/** Map<trackerId, target> for every tracker on a day. */
export function targetsForDay(challenge, day) {
  const out = new Map();
  for (const t of challenge.trackers || []) out.set(key(t), targetFor(challenge, t, day));
  return out;
}

/** [{day, target}] for the whole challenge — what the ramp preview draws. */
export function rampSeries(challenge, tracker) {
  const series = tracker.rollup
    ? null
    : leafRampSeries(challenge, tracker);
  const out = [];
  for (let d = 1; d <= challenge.totalDays; d += 1) {
    out.push({ day: d, target: targetFor(challenge, tracker, d) });
  }
  void series;
  return out;
}

/* ------------------------------------------------------------------ */
/* Values                                                              */
/* ------------------------------------------------------------------ */

/**
 * The value a single entry records for its tracker.
 *
 * A set-tracker is the sum of its sets; a check is 1 when done, 0 otherwise;
 * anything else is the raw value. Null when the entry holds nothing.
 */
export function leafValue(entry, tracker) {
  if (!entry) return null;
  if (tracker.metric === "check") return entry.done ? 1 : 0;
  if (tracker.useSets && Array.isArray(entry.sets) && entry.sets.length) {
    return entry.sets.reduce((a, b) => a + (Number(b) || 0), 0);
  }
  return entry.value != null ? entry.value : null;
}

/**
 * Map<trackerId, value> for one log, rollups computed bottom-up from their
 * children's entries. A tracker with nothing logged that day maps to null.
 */
export function valuesForLog(challenge, log) {
  const byTracker = new Map(
    (log?.entries || []).map((e) => [String(e.trackerId), e])
  );
  const out = new Map();

  const compute = (t) => {
    if (t.rollup) {
      let sum = 0;
      let any = false;
      for (const child of childrenOf(challenge, t._id)) {
        const v = compute(child);
        if (v != null) {
          sum += v;
          any = true;
        }
      }
      return any ? sum : null;
    }
    const entry = byTracker.get(key(t));
    return leafValue(entry, t);
  };

  for (const t of challenge.trackers || []) out.set(key(t), compute(t));
  return out;
}

/* ------------------------------------------------------------------ */
/* Scoring                                                             */
/* ------------------------------------------------------------------ */

const CAP = 1.5;

/** The 0–1.5 score for one directly-tracked tracker: actual vs target. */
function scoreForTracker(actual, target, tracker) {
  if (actual == null) return 0;
  // No target yet (a calibration day): logging anything counts as meeting it.
  if (target == null) return 1;

  let ratio;
  if (tracker.direction === "decrease") {
    // Lower is better. Hitting exactly 0 when the target is 0 is perfect.
    if (actual === 0) ratio = target === 0 ? 1 : 0;
    else ratio = target / actual;
  } else {
    if (target === 0) ratio = actual >= 0 ? 1 : 0;
    else ratio = actual / target;
  }
  return Math.min(ratio, CAP);
}

/**
 * The 0–100 score of one log day.
 *
 * Each **top-level habit** contributes: a directly-tracked habit scores its
 * own actual against its target; a rollup habit scores the average of its
 * children's scores. The day's score is the mean of those, ×100. A day with
 * no entries scores 0.
 *
 * Targets come from the entry's own `target` snapshot when present — so a
 * goal changed mid-challenge does not rewrite how past days score — and fall
 * back to the current ramp for the live, not-yet-saved day, where the caller
 * has not snapshotted anything yet.
 */
export function dayScore(challenge, log) {
  if (!log || !Array.isArray(log.entries) || log.entries.length === 0) return 0;

  const values = valuesForLog(challenge, log);
  const snapshotTarget = new Map(
    log.entries.map((e) => [String(e.trackerId), e.target])
  );
  const day = log.dayNumber;

  const scoreRec = (t) => {
    const actual = values.get(key(t));
    if (t.rollup) {
      const kids = childrenOf(challenge, t._id);
      if (!kids.length) return actual == null ? 0 : 1;
      const scores = kids.map(scoreRec);
      return scores.reduce((a, b) => a + b, 0) / scores.length;
    }
    let target = snapshotTarget.get(key(t));
    if (target == null) target = targetFor(challenge, t, day);
    return scoreForTracker(actual, target, t);
  };

  const tops = topLevelTrackers(challenge);
  if (!tops.length) return 0;
  const scores = tops.map(scoreRec);
  return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100);
}

/* ------------------------------------------------------------------ */
/* Per-tracker stats: progress, improvement, pace                      */
/* ------------------------------------------------------------------ */

/**
 * The logged days for one tracker, as {day, date, value} ascending.
 * For a rollup, a day counts as logged when any descendant has an entry.
 */
function trackerSeries(challenge, logs, tracker) {
  const out = [];
  for (const log of logs || []) {
    const values = valuesForLog(challenge, log);
    const v = values.get(key(tracker));
    if (v != null) out.push({ day: log.dayNumber, date: log.date, value: v });
  }
  out.sort((a, b) => a.day - b.day);
  return out;
}

function mean(nums) {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/** Did a logged value meet its target for its direction? */
function metTarget(value, target, tracker) {
  if (target == null || value == null) return false;
  return tracker.direction === "decrease" ? value <= target : value >= target;
}

/**
 * The "will I make it?" answer for one tracker: a least-squares fit over the
 * last 14 logged days, extended to the final day, and judged against the goal.
 *
 * `check` habits have no value to regress — their pace is simply the
 * completion rate, projected across the whole challenge.
 */
function projectPace(tracker, series, challenge, today, currentLevel) {
  const N = challenge.totalDays;

  if (tracker.metric === "check") {
    const elapsed = Math.max(1, Math.min(today, N));
    const met = series.filter((p) => metTarget(p.value, 1, tracker)).length;
    const completionRate = met / elapsed;
    const projectedFinal = completionRate * N;
    const goal = N; // want a successful day on every day
    const status =
      projectedFinal >= goal * 0.95
        ? "on_track"
        : projectedFinal >= goal * 0.8
        ? "close"
        : "behind";
    return {
      metric: "check",
      completionRate,
      projectedFinal,
      status,
      points: series.length,
    };
  }

  const points = series.slice(-14);
  const n = points.length;
  if (n < 3) {
    return {
      metric: tracker.metric,
      status: "not_enough_data",
      points: n,
    };
  }

  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (const p of points) {
    sx += p.day;
    sy += p.value;
    sxx += p.day * p.day;
    sxy += p.day * p.value;
  }
  const denom = n * sxx - sx * sx;
  const slope = denom !== 0 ? (n * sxy - sx * sy) / denom : 0;
  const intercept = (sy - slope * sx) / n;

  const projectedFinal = intercept + slope * N;
  const daysLeft = N - today;
  const requiredSlope = (tracker.goal - currentLevel) / Math.max(daysLeft, 1);
  const etaDay = slope > 0 ? Math.ceil((tracker.goal - intercept) / slope) : null;

  const goal = tracker.goal;
  const status =
    projectedFinal >= goal * 0.95
      ? "on_track"
      : projectedFinal >= goal * 0.8
      ? "close"
      : "behind";

  return {
    metric: tracker.metric,
    slope,
    intercept,
    projectedFinal,
    daysLeft,
    requiredSlope,
    etaDay,
    status,
    points: n,
  };
}

/**
 * Everything the Progress tab shows for one tracker.
 *
 * `today` is a **day number** (pass currentDay). `logs` are the challenge's
 * log documents, any order — they are sorted by day internally.
 */
export function trackerStats(challenge, logs, trackerId, today) {
  const wanted = String(trackerId);
  const tracker = (challenge.trackers || []).find((t) => key(t) === wanted);
  if (!tracker) return null;

  const N = challenge.totalDays;
  const todayDay = Math.max(1, Math.min(N, today));
  const series = trackerSeries(challenge, logs, tracker);
  const logged = new Set(series.map((p) => p.day));

  const last = series[series.length - 1] || null;
  const prev = series[series.length - 2] || null;
  const lastThree = series.slice(-3).map((p) => p.value);
  const currentLevel = mean(lastThree);

  const todayPoint = series.find((p) => p.day === todayDay) || null;
  const todayValue = todayPoint ? todayPoint.value : null;
  const todayTarget = targetFor(challenge, tracker, todayDay);

  // "vs yesterday": the latest logged day against the one before it.
  let delta = null;
  let deltaPct = null;
  if (last && prev) {
    delta = last.value - prev.value;
    deltaPct = prev.value !== 0 ? (delta / prev.value) * 100 : null;
  }

  const b = tracker.baseline;
  const sinceBaselinePct =
    b != null && currentLevel != null && b !== 0
      ? ((currentLevel - b) / b) * 100
      : null;

  // (current − baseline) / (goal − baseline) is direction-agnostic: when the
  // goal is below the baseline (a "decrease" habit) both terms flip sign and
  // the fraction still runs 0 → 100 as you approach the goal.
  let progressToGoal = null;
  if (currentLevel != null && b != null && tracker.goal != null && tracker.goal !== b) {
    progressToGoal = Math.max(
      0,
      Math.min(100, ((currentLevel - b) / (tracker.goal - b)) * 100)
    );
  } else if (currentLevel != null && b != null && tracker.goal === b) {
    progressToGoal = 100;
  }

  const vsPlan =
    currentLevel != null && todayTarget != null
      ? currentLevel - todayTarget
      : null;

  const elapsed = Math.max(1, Math.min(todayDay, N));
  const consistencyPct = (logged.size / elapsed) * 100;

  // Streaks: consecutive calendar days that were logged *and* met target.
  let currentStreak = 0;
  let bestStreak = 0;
  for (let d = 1; d <= todayDay; d += 1) {
    if (!logged.has(d)) {
      currentStreak = 0;
      continue;
    }
    const value = series.find((p) => p.day === d).value;
    const entry =
      (logs.find((l) => l.dayNumber === d)?.entries || []).find(
        (e) => String(e.trackerId) === key(tracker)
      ) || null;
    const met = entry && entry.target != null ? metTarget(value, entry.target, tracker) : false;
    if (met) {
      currentStreak += 1;
      bestStreak = Math.max(bestStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }

  const pace = projectPace(tracker, series, challenge, todayDay, currentLevel);

  return {
    id: key(tracker),
    name: tracker.name,
    metric: tracker.metric,
    unit: tracker.unit,
    rollup: tracker.rollup,
    baseline: b,
    goal: tracker.goal,
    hasLogs: series.length > 0,
    currentLevel,
    todayValue,
    todayTarget,
    latest: last,
    previous: prev,
    delta,
    deltaPct,
    sinceBaselinePct,
    progressToGoal,
    vsPlan,
    consistencyPct,
    currentStreak,
    bestStreak,
    pace,
  };
}

/**
 * The whole Progress tab in one call: per-tracker stats for every
 * non-archived tracker, the daily score series, and an overall summary.
 *
 * `today` is a day number (currentDay).
 */
export function challengeStats(challenge, logs, today) {
  const N = challenge.totalDays;
  const todayDay = Math.max(1, Math.min(N, today));
  const allLogs = [...(logs || [])].sort((a, b) => a.dayNumber - b.dayNumber);

  const logByDay = new Map(allLogs.map((l) => [l.dayNumber, l]));
  const dailyScores = [];
  for (let d = 1; d <= todayDay; d += 1) {
    const log = logByDay.get(d) || null;
    dailyScores.push({
      day: d,
      date: dateKeyForDay(challenge, d),
      logged: Boolean(log),
      score: log ? dayScore(challenge, log) : 0,
    });
  }

  const byTracker = {};
  for (const t of challenge.trackers || []) {
    if (t.archived) continue;
    byTracker[key(t)] = trackerStats(challenge, allLogs, t._id, todayDay);
  }

  const tops = topLevelTrackers(challenge).map((t) => byTracker[key(t)]);
  const progresses = tops
    .map((t) => t.progressToGoal)
    .filter((p) => p != null);
  const consistencies = Object.values(byTracker)
    .filter((t) => t && t.hasLogs)
    .map((t) => t.consistencyPct);

  const todayLog = logByDay.get(todayDay) || null;
  const summary = {
    dayNumber: todayDay,
    totalDays: N,
    todayScore: todayLog ? dayScore(challenge, todayLog) : null,
    overallProgress: progresses.length
      ? Math.round(progresses.reduce((a, b) => a + b, 0) / progresses.length)
      : null,
    consistency: consistencies.length
      ? Math.round(consistencies.reduce((a, b) => a + b, 0) / consistencies.length)
      : 0,
    currentStreak: Math.max(0, ...tops.map((t) => t.currentStreak || 0)),
    bestStreak: Math.max(0, ...tops.map((t) => t.bestStreak || 0)),
    loggedDays: allLogs.filter((l) => l.dayNumber <= todayDay).length,
  };

  return {
    summary,
    dailyScores,
    byTracker,
    topLevel: tops.map((t) => t.id),
  };
}

/**
 * Turn a trackerStats result into the one-line message the Pace card shows.
 *
 * "At this pace you'll reach 82 push-ups by day 88 (goal 100). Add about
 * +1.3/day to get back on track." — or, when the line already clears the
 * goal in time, "You'll hit your goal around day 71."
 */
export function paceMessage(stats, totalDays) {
  const p = stats?.pace;
  if (!p) return "";
  const unit = stats.unit ? ` ${stats.unit}` : "";

  if (p.status === "not_enough_data") {
    return "Log a few more days to see your pace.";
  }

  if (p.metric === "check") {
    const projected = Math.round(p.projectedFinal);
    const goal = totalDays || 0;
    if (p.status === "on_track") {
      return `On pace to make it most days — about ${projected} of ${goal}.`;
    }
    return `At this rate you'll make it ${projected} of ${goal} days. Keep showing up.`;
  }

  const final = Math.round(p.projectedFinal);
  const goal = Math.round(stats.goal ?? 0);
  const base = `At this pace you'll reach ${final}${unit} by day ${totalDays} (goal ${goal}${unit}).`;
  if (p.etaDay && p.status === "on_track") {
    return `You'll hit your goal around day ${p.etaDay}. ${base}`;
  }
  if (p.status === "behind" && p.requiredSlope > 0) {
    const perDay =
      p.requiredSlope >= 10 ? Math.round(p.requiredSlope) : p.requiredSlope.toFixed(1);
    return `${base} Add about +${perDay}/day to get back on track.`;
  }
  if (p.status === "close") {
    return `${base} Just a little further to lock it in.`;
  }
  return base;
}
