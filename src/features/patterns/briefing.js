/**
 * The weekly briefing — the week's habits and spending said out loud, in
 * plain words, the way a honest friend would say them.
 *
 * Everything here is pure: planner goals and expense tallies in, human
 * sentences out. No LLM is involved, so the briefing paints instantly and
 * can never invent a number — every figure in the text came straight from
 * the rows that were passed in.
 */

const DAY_KEYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Note tones, in the order they should be read: hard truths first,
 *  encouragement last, so the briefing ends on a high note. */
const TONE_ORDER = { miss: 0, nudge: 1, info: 2, praise: 3 };

function note(tone, text) {
  return { tone, text };
}

/** NPR formatting for sentence-embedded figures (rupees, grouped). */
function npr(rupees) {
  return `NPR ${Math.round(rupees).toLocaleString("en-IN")}`;
}

/**
 * One goal's week so far. Days before today left "pending" count as
 * missed — the briefing talks about checkmarks, and an unticked past day
 * honestly has no checkmark.
 *
 * @param {object} goal         planner goal with `days`
 * @param {number} elapsedDays  days from Monday to today, inclusive (1–7)
 */
export function summariseGoalWeek(goal, elapsedDays) {
  const elapsed = Math.max(1, Math.min(7, elapsedDays));
  let done = 0;
  for (let i = 0; i < elapsed; i++) {
    if (goal.days?.[DAY_KEYS[i]] === "done") done++;
  }
  return {
    title: goal.title,
    done,
    elapsed,
    missed: elapsed - done,
    remaining: DAY_KEYS.length - elapsed,
  };
}

/**
 * Habit notes for the week so far — praise where it's earned, a direct
 * call-out where a goal is being dropped, and a push where it's slipping.
 *
 * @param {object[]} goals      this week's planner goals
 * @param {number} elapsedDays  days from Monday to today, inclusive
 * @param {string} name         the user's first name
 */
export function buildHabitNotes(goals, elapsedDays, name) {
  const notes = [];
  for (const goal of goals ?? []) {
    const g = summariseGoalWeek(goal, elapsedDays);
    const ratio = g.done / g.elapsed;

    if (g.done === 7) {
      notes.push(
        note(
          "praise",
          `Seven out of seven on ${g.title} — a flawless week, ${name}. This is what a habit looks like when it sticks.`
        )
      );
    } else if (g.done === g.elapsed && g.elapsed >= 3) {
      notes.push(
        note(
          "praise",
          `${g.title}: ${g.done} for ${g.done} so far. A perfect week in the making, ${name} — protect the streak.`
        )
      );
    } else if (g.done === g.elapsed) {
      notes.push(
        note(
          "praise",
          `Good start, ${name} — ${g.title} is ticked every day so far. Keep it moving.`
        )
      );
    } else if (g.done === 0 && g.elapsed >= 2) {
      notes.push(
        note(
          "miss",
          `${name}, ${g.title} hasn't had a single checkmark this week. If it still matters — and it does — do the smallest version of it today, so it doesn't quietly disappear.`
        )
      );
    } else if (g.done === 0) {
      notes.push(
        note(
          "nudge",
          `New week, ${name} — ${g.title} is still waiting for its first tick.`
        )
      );
    } else if (ratio >= 0.6) {
      notes.push(
        note(
          "praise",
          `You're holding ${g.title} — ${g.done} of ${g.elapsed} days. Great going, ${name}; finish the week strong.`
        )
      );
    } else if (ratio < 0.34) {
      notes.push(
        note(
          "nudge",
          `${g.title} is slipping, ${name} — ${g.done} of ${g.elapsed} days so far. One tick today changes the story of this week.`
        )
      );
    } else {
      notes.push(
        note(
          "nudge",
          `A mixed week on ${g.title} — ${g.done} of ${g.elapsed} days. The miss matters less than what you do tomorrow.`
        )
      );
    }
  }
  return notes;
}

/** A suggestion tuned to what the money was spent on. */
function categorySuggestion(categoryName) {
  const n = (categoryName || "").toLowerCase();
  if (/food|eat|restaur|dining|dinner|lunch|snack|coffee|tea|khaja|fast/.test(n)) {
    return "Eating at home a couple more times would cut that hard — cheaper, and your body thanks you too.";
  }
  if (/transport|fuel|taxi|ride|bus|petrol|travel/.test(n)) {
    return "A few walks or shared rides a week would trim this without changing your life.";
  }
  if (/shop|cloth|fashion|gadget|electronic|online/.test(n)) {
    return "Try the 24-hour rule — want it today, buy it tomorrow only if you still do.";
  }
  if (/entertain|movie|game|fun|party|drink|bar/.test(n)) {
    return "Fun matters — just cap it. Pick one outing a week and make it count.";
  }
  if (/subscri|internet|phone|recharge|bill|utilit/.test(n)) {
    return "These repeat every month — check you're not paying for something you stopped using.";
  }
  return "Worth a second look before next week — small leaks sink budgets.";
}

/**
 * Money notes for the week so far.
 *
 * @param {object} input
 * @param {number} input.weekPaisa       this week's total (Mon–today)
 * @param {number} input.lastWeekPaisa   the full previous week
 * @param {object|null} input.top        { name, icon, paisa, share } — the
 *                                       biggest category this week
 * @param {number} input.categoryCount   distinct categories used this week
 * @param {string} input.name            the user's first name
 */
export function buildMoneyNotes({ weekPaisa, lastWeekPaisa, top, categoryCount, name }) {
  const notes = [];
  const week = weekPaisa / 100;
  const last = lastWeekPaisa / 100;

  if (weekPaisa === 0) {
    notes.push(
      note(
        "info",
        lastWeekPaisa > 0
          ? `Nothing logged yet this week — last week you tracked ${npr(last)}. Log as you go, ${name}, or the record lies to you later.`
          : `No spending logged yet, ${name}. The money side of this briefing only works if every expense goes in as it happens.`
      )
    );
    return notes;
  }

  if (lastWeekPaisa > 0) {
    const change = (weekPaisa - lastWeekPaisa) / lastWeekPaisa;
    if (change <= -0.1) {
      notes.push(
        note(
          "praise",
          `You've spent ${npr(week)} this week — ${Math.abs(Math.round(change * 100))}% less than last week. That's discipline, ${name}.`
        )
      );
    } else if (change >= 0.15) {
      notes.push(
        note(
          "nudge",
          `Spending is running ${Math.round(change * 100)}% above last week — ${npr(week)} against ${npr(last)}. Worth a glance at where it went.`
        )
      );
    } else {
      notes.push(
        note(
          "info",
          `You've logged ${npr(week)} this week — about the same as last week.`
        )
      );
    }
  } else {
    notes.push(
      note("info", `You've logged ${npr(week)} this week — the first week on record.`)
    );
  }

  if (top && top.share >= 0.35 && top.paisa > 0) {
    const pct = Math.round(top.share * 100);
    notes.push(
      note(
        "nudge",
        `${name}, ${top.name} is eating ${pct}% of this week's spending (${npr(top.paisa / 100)}). ${categorySuggestion(top.name)}`
      )
    );
  } else if (categoryCount >= 3) {
    notes.push(
      note(
        "praise",
        `Your spending is nicely spread this week — no single category is eating the budget. Nicely done, ${name}.`
      )
    );
  }

  return notes;
}

/** Hard truths first, praise last. */
export function orderNotes(notes) {
  return [...notes].sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]);
}
