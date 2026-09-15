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
 * @returns {{dateKey: string, weekday: string, weekStart: string, hour: number}}
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
