/**
 * Pure reminder logic — what time it is for the user, and what (if anything)
 * to tell them. No database, no push; see run.js for those.
 */

/** Reminders follow Nepal time (UTC+5:45), which has no daylight saving. */
const NEPAL_OFFSET_MIN = 5 * 60 + 45;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** No entries for this many days switches to the catch-up message. */
export const AWAY_AFTER_DAYS = 3;

/**
 * The Nepal-local calendar for an instant, independent of the server's own
 * timezone (UTC on Vercel).
 * @param {Date} [now]
 * @returns {{dateKey: string, weekday: string, weekStart: string, hour: number, minute: number}}
 */
export function nepalClock(now = new Date()) {
  const local = new Date(now.getTime() + NEPAL_OFFSET_MIN * 60_000);
  const dow = local.getUTCDay();
  const monday = new Date(local);
  monday.setUTCDate(local.getUTCDate() - ((dow + 6) % 7));
  return {
    dateKey: local.toISOString().slice(0, 10),
    weekday: WEEKDAYS[dow],
    weekStart: monday.toISOString().slice(0, 10),
    hour: local.getUTCHours(),
    minute: local.getUTCMinutes(),
  };
}

/**
 * Which reminder a run belongs to. Crons can fire late within their hour,
 * so this splits the day rather than matching 10 and 20 exactly.
 */
export function slotFor(hour) {
  return hour < 15 ? "morning" : "evening";
}

/** Whole days from one 'YYYY-MM-DD' key to another. */
export function daysBetween(fromKey, toKey) {
  return Math.round((Date.parse(toKey) - Date.parse(fromKey)) / 86_400_000);
}

export function firstName(name) {
  return String(name || "").trim().split(/\s+/)[0] || "Hey";
}

/**
 * The notification for one user, or null when there is nothing to nudge.
 *
 * Someone who has already logged today's expenses and closed today's goals
 * gets nothing: reminding people about what they already did is how
 * notifications end up switched off.
 *
 * @param {object} state
 * @param {string} state.name
 * @param {"morning"|"evening"} state.slot
 * @param {boolean} state.expenseLoggedToday
 * @param {number} state.goalsToday planner goals this week (each has a slot today)
 * @param {number} state.goalsPending of those, still pending today
 * @param {number|null} state.daysAway days since the last entry; null if never
 * @returns {{title: string, body: string, url: string, tag: string}|null}
 */
export function buildReminder({
  name,
  slot,
  expenseLoggedToday,
  goalsToday,
  goalsPending,
  daysAway,
}) {
  const who = firstName(name);
  const tag = "daily-reminder";

  if (daysAway !== null && daysAway >= AWAY_AFTER_DAYS) {
    return {
      title: "It's been a while",
      body: `${who}, it's been ${daysAway} days since your last entry. A two-minute catch-up keeps your picture accurate.`,
      url: "/app",
      tag,
    };
  }

  const goalsOpen = goalsToday > 0 && goalsPending > 0;
  if (expenseLoggedToday && !goalsOpen) return null;

  const left = goalsOpen ? ` ${goalsPending} still open.` : "";
  let body;
  if (!expenseLoggedToday && goalsOpen) {
    body = `${who}, have you logged your expenses and achieved today's goals?${left}`;
  } else if (!expenseLoggedToday) {
    body = `${who}, have you logged today's expenses?`;
  } else {
    body = `${who}, have you achieved today's goals?${left}`;
  }

  return {
    title: slot === "morning" ? "Good morning" : "Evening check-in",
    body,
    url: expenseLoggedToday ? "/app/planner" : "/app/budget/expenses",
    tag,
  };
}

/**
 * How long after a goal's time its nudge may still go out. Wider than the
 * scheduler's interval so a late or skipped run still lands, narrow enough
 * that a 6 am goal added at 3 pm doesn't ping the moment it is saved.
 */
export const GOAL_TIME_WINDOW_MIN = 60;

/** 'HH:mm' → minutes since midnight. */
export function minutesOf(time) {
  const [h, m] = String(time).split(":").map(Number);
  return h * 60 + m;
}

/**
 * Whether a timed planner goal is due a nudge right now: it has a time, that
 * time passed within the window, today's cell is still unchecked, and today's
 * nudge hasn't gone out yet. Goals without a time are never due.
 *
 * @param {{time?: string, days?: object, timeRemindedOn?: string}} goal
 * @param {ReturnType<typeof nepalClock>} clock
 */
export function goalTimeDue(goal, clock) {
  if (!goal.time || !/^\d{2}:\d{2}$/.test(goal.time)) return false;
  if ((goal.days?.[clock.weekday] ?? "pending") !== "pending") return false;
  if (goal.timeRemindedOn === clock.dateKey) return false;
  const late = clock.hour * 60 + clock.minute - minutesOf(goal.time);
  return late >= 0 && late < GOAL_TIME_WINDOW_MIN;
}

/**
 * A time as someone types it → 'HH:mm', or null if it isn't one.
 * Takes '6:30 pm', '6.30pm', '630pm', '6pm', '18:30', '1830' and '6' (6 AM).
 * Without am/pm the hour is read as 24-hour.
 */
export function parseTypedTime(input) {
  const text = String(input ?? "").trim().toLowerCase().replace(/\s+/g, "");
  const match = /^(\d{1,2})(?:[:.]?(\d{2}))?(a|p|am|pm)?$/.exec(text);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const meridiem = match[3]?.[0];
  if (minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (meridiem === "p" ? 12 : 0);
  } else if (hour > 23) {
    return null;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** '18:30' → '6:30 PM'. */
export function formatTime(time) {
  const mins = minutesOf(time);
  const h = Math.floor(mins / 60);
  const m = String(mins % 60).padStart(2, "0");
  return `${h % 12 || 12}:${m} ${h < 12 ? "AM" : "PM"}`;
}

/**
 * The nudge for one user's goals whose time passed unchecked.
 *
 * @param {{name: string, goals: {title: string, time: string}[]}} state
 * @returns {{title: string, body: string, url: string, tag: string}|null}
 */
export function buildGoalTimeReminder({ name, goals }) {
  if (!goals.length) return null;
  const who = firstName(name);
  const tag = "goal-time-reminder";
  if (goals.length === 1) {
    const [goal] = goals;
    const at = formatTime(goal.time);
    return {
      title: `${goal.title} · ${at}`,
      body: `${who}, you need to check your goal "${goal.title}" — it was due at ${at}. Done it? Tick it off.`,
      url: "/app/planner",
      tag,
    };
  }
  const titles = goals.map((g) => `"${g.title}"`).join(", ");
  return {
    title: `${goals.length} goals are waiting`,
    body: `${who}, you need to check your goals: ${titles}. Done them? Tick them off.`,
    url: "/app/planner",
    tag,
  };
}

/** The instant a Nepal-local 'YYYY-MM-DD' + 'HH:mm' falls on. */
export function nepalInstant(dateKey, time) {
  return new Date(Date.parse(`${dateKey}T${time}:00Z`) - NEPAL_OFFSET_MIN * 60_000);
}

/**
 * When the next of these goals becomes due today, or null if none will.
 * The open app sets a timer for it, so the nudge lands on the minute instead
 * of on the next poll.
 *
 * @param {{time?: string, days?: object, timeRemindedOn?: string}[]} goals
 * @param {ReturnType<typeof nepalClock>} clock
 * @returns {Date|null}
 */
export function nextGoalTimeAt(goals, clock) {
  const nowMin = clock.hour * 60 + clock.minute;
  let next = null;
  for (const goal of goals) {
    if (!goal.time || !/^\d{2}:\d{2}$/.test(goal.time)) continue;
    if ((goal.days?.[clock.weekday] ?? "pending") !== "pending") continue;
    if (goal.timeRemindedOn === clock.dateKey) continue;
    if (minutesOf(goal.time) <= nowMin) continue; // due now or past — not "next"
    if (!next || goal.time < next) next = goal.time;
  }
  return next ? nepalInstant(clock.dateKey, next) : null;
}
