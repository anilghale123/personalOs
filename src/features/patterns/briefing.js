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
 * `gap` is how many days have passed since the last tick, counting back
 * from today. When the goal has no tick at all this week, `priorGap`
 * (trailing untouched days at the end of last week) is added, so the
 * briefing can say "nine days" instead of resetting the count every
 * Monday and letting a dropped habit look fresh.
 *
 * @param {object} goal         planner goal with `days`
 * @param {number} elapsedDays  days from Monday to today, inclusive (1–7)
 * @param {number} [priorGap]   untouched trailing days from last week
 */
export function summariseGoalWeek(goal, elapsedDays, priorGap = 0) {
  const elapsed = Math.max(1, Math.min(7, elapsedDays));
  let done = 0;
  for (let i = 0; i < elapsed; i++) {
    if (goal.days?.[DAY_KEYS[i]] === "done") done++;
  }

  let gap = 0;
  for (let i = elapsed - 1; i >= 0; i--) {
    if (goal.days?.[DAY_KEYS[i]] === "done") break;
    gap++;
  }
  if (done === 0) gap += Math.max(0, priorGap);

  return {
    title: goal.title,
    done,
    elapsed,
    missed: elapsed - done,
    remaining: DAY_KEYS.length - elapsed,
    gap,
  };
}

/** "IELTS, breathing and 2 more" — never a bullet list of every goal. */
function listOf(titles, max = 4) {
  const shown = titles.slice(0, max);
  const extra = titles.length - shown.length;
  if (extra > 0) return `${shown.join(", ")} and ${extra} more`;
  if (shown.length === 1) return shown[0];
  return `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
}

/** How long a gap has been open, in words rather than a raw count. */
function dayPhrase(days) {
  if (days >= 21) return "three weeks";
  if (days >= 14) return "two weeks";
  if (days >= 8) return "over a week";
  if (days === 7) return "a week";
  if (days <= 1) return "a day";
  return `${days} days`;
}

const isAre = (n) => (n === 1 ? "is" : "are");

/**
 * Habit notes for the week so far — **grouped, not enumerated**.
 *
 * One sentence per goal turns a ten-goal planner into a ten-line list
 * nobody reads. Goals are bucketed by how the week is actually going and
 * each bucket gets a single sentence naming the goals in it, so the
 * briefing stays four lines whether you track three habits or fifteen.
 *
 * @param {object[]} goals      this week's planner goals, each optionally
 *                              carrying `priorGap` from last week
 * @param {number} elapsedDays  days from Monday to today, inclusive
 * @param {string} name         the user's first name
 */
export function buildHabitNotes(goals, elapsedDays, name) {
  const summaries = (goals ?? []).map((g) =>
    summariseGoalWeek(g, elapsedDays, g.priorGap ?? 0)
  );
  if (!summaries.length) return [];

  const dropped = [];   // not a single tick
  const slipping = [];  // ticked, but the minority of days
  const holding = [];   // more days on than off
  const strong = [];    // near-perfect

  for (const g of summaries) {
    const ratio = g.done / g.elapsed;
    if (g.done === 0) dropped.push(g);
    else if (ratio >= 0.8) strong.push(g);
    else if (ratio >= 0.5) holding.push(g);
    else slipping.push(g);
  }

  const notes = [];

  if (dropped.length) {
    // Longest gap first — it is both the worst news and the most useful.
    const worst = [...dropped].sort((a, b) => b.gap - a.gap)[0];
    const titles = [...dropped]
      .sort((a, b) => b.gap - a.gap)
      .map((g) => g.title);

    notes.push(
      note(
        "miss",
        dropped.length === 1
          ? `${name}, ${worst.title} hasn't had a checkmark in ${dayPhrase(worst.gap)}. Do the smallest version of it today — that is how it survives.`
          : `${name}, you're missing ${listOf(titles)} — ${worst.title} the longest, ${dayPhrase(worst.gap)} now. Pick one and do it today.`
      )
    );
  }

  if (slipping.length) {
    const titles = slipping.map((g) => g.title);
    const done = slipping.reduce((sum, g) => sum + g.done, 0);
    const possible = slipping.reduce((sum, g) => sum + g.elapsed, 0);
    notes.push(
      note(
        "nudge",
        `${listOf(titles)} ${isAre(slipping.length)} slipping — ${done} of ${possible} days between them. One tick each today changes the story of this week.`
      )
    );
  }

  if (holding.length) {
    const titles = holding.map((g) => g.title);
    notes.push(
      note(
        "info",
        `${listOf(titles)} ${isAre(holding.length)} holding — more days on than off. Finish the week strong, ${name}.`
      )
    );
  }

  if (strong.length) {
    const titles = strong.map((g) => g.title);
    const perfect = strong.every((g) => g.done === g.elapsed);
    const full = perfect && strong[0].elapsed === 7;

    notes.push(
      note(
        "praise",
        full
          ? `A flawless week, ${name} — ${listOf(titles)} ticked every single day.`
          : perfect
          ? `Great, ${name} — you're consistently doing ${listOf(titles)}, every day so far this week.`
          : `Great, ${name} — you're staying consistent with ${listOf(titles)}. That's the part that compounds.`
      )
    );
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
  return "Worth a second look before next month — small leaks sink budgets.";
}

/**
 * Money notes for the month so far.
 *
 * The money half of the briefing runs on calendar months, not weeks:
 * rent, salary, subscriptions and budgets all land monthly, so a
 * seven-day window kept calling a normal rent week a spending problem.
 *
 * `lastMonthPaisa` is the *same opening stretch* of the previous month
 * rather than the whole of it — comparing three days against thirty-one
 * would report a triumph every month on the 3rd.
 *
 * @param {object} input
 * @param {number} input.monthPaisa       this month's total so far
 * @param {number} input.lastMonthPaisa   last month over the same stretch
 * @param {boolean} [input.lastMonthPartial] true when that stretch stops
 *                                        short of the full month
 * @param {object|null} input.top         { name, paisa, share } — the
 *                                        biggest category this month
 * @param {number} input.categoryCount    distinct categories used
 * @param {string} input.name             the user's first name
 */
export function buildMoneyNotes({
  monthPaisa,
  lastMonthPaisa,
  lastMonthPartial = false,
  top,
  categoryCount,
  name,
}) {
  const notes = [];
  const month = monthPaisa / 100;
  const last = lastMonthPaisa / 100;
  // What the comparison is actually against, said plainly.
  const against = lastMonthPartial ? "the same stretch of last month" : "last month";

  if (monthPaisa === 0) {
    notes.push(
      note(
        "info",
        lastMonthPaisa > 0
          ? `Nothing logged yet this month — by this point last month you had tracked ${npr(last)}. Log as you go, ${name}, or the record lies to you later.`
          : `No spending logged yet, ${name}. The money side of this briefing only works if every expense goes in as it happens.`
      )
    );
    return notes;
  }

  if (lastMonthPaisa > 0) {
    const change = (monthPaisa - lastMonthPaisa) / lastMonthPaisa;
    if (change <= -0.1) {
      notes.push(
        note(
          "praise",
          `You've spent ${npr(month)} this month — ${Math.abs(Math.round(change * 100))}% less than ${against}. That's discipline, ${name}.`
        )
      );
    } else if (change >= 0.15) {
      notes.push(
        note(
          "nudge",
          `Spending is running ${Math.round(change * 100)}% above ${against} — ${npr(month)} against ${npr(last)}. Worth a glance at where it went.`
        )
      );
    } else {
      notes.push(
        note(
          "info",
          `You've logged ${npr(month)} this month — about the same as ${against}.`
        )
      );
    }
  } else {
    notes.push(
      note("info", `You've logged ${npr(month)} this month — the first month on record.`)
    );
  }

  if (top && top.share >= 0.35 && top.paisa > 0) {
    const pct = Math.round(top.share * 100);
    notes.push(
      note(
        "nudge",
        `${name}, ${top.name} is eating ${pct}% of this month's spending (${npr(top.paisa / 100)}). ${categorySuggestion(top.name)}`
      )
    );
  } else if (categoryCount >= 3) {
    notes.push(
      note(
        "praise",
        `Your spending is nicely spread this month — no single category is eating the budget. Nicely done, ${name}.`
      )
    );
  }

  return notes;
}

/** Hard truths first, praise last. */
export function orderNotes(notes) {
  return [...notes].sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]);
}
