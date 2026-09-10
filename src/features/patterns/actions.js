"use server";

import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongoose";
import Insight from "@/models/Insight";
import PatternRun from "@/models/PatternRun";
import PlannerGoal from "@/models/PlannerGoal";
import Expense from "@/models/Expense";
import Category from "@/models/Category";
import { toDateKey } from "@/lib/utils";
import { weekStartKey } from "@/lib/week";
import {
  currentMonthCursor,
  monthCursorLabel,
  monthCursorRange,
  shiftMonthCursor,
} from "@/lib/months";
import { userCalendar } from "@/features/budget/summary";
import { getDailySignals } from "./signals";
import { renderStatement, RUN_TTL_HOURS } from "./constants";
import { addDays, dayDiff } from "./dates";
import { buildHabitNotes, buildMoneyNotes, orderNotes } from "./briefing";

/**
 * Server-side data fetchers for the Discoveries screens.
 *
 * These read stored insights only — they never trigger a run. Rendering
 * the page must not wait on a multi-collection scan; the client store
 * asks `POST /api/patterns/run` in the background when the TTL says the
 * stored set is stale, and the feed updates when it lands.
 */

/** Plain, client-safe shape for one stored insight. */
function toFeedItem(doc) {
  return {
    id: String(doc._id),
    detectorId: doc.detectorId,
    params: doc.params ?? {},
    family: doc.family,
    title: doc.title,
    statement: renderStatement(doc.statementKey, doc.statementVars),
    domains: doc.domains ?? [],
    status: doc.status,
    effect: doc.effect ?? null,
    direction: doc.direction,
    n: doc.n,
    qValue: doc.qValue,
    pValue: doc.pValue,
    confidence: doc.confidence,
    windowFrom: doc.windowFrom,
    windowTo: doc.windowTo,
    timesConfirmed: doc.timesConfirmed,
    unstable: Boolean(doc.unstable),
    firstDetectedAt: doc.firstDetectedAt ? new Date(doc.firstDetectedAt).toISOString() : null,
    lastConfirmedAt: doc.lastConfirmedAt ? new Date(doc.lastConfirmedAt).toISOString() : null,
    readAt: doc.readAt ? new Date(doc.readAt).toISOString() : null,
    feedback: doc.feedback?.rating
      ? { rating: doc.feedback.rating, note: doc.feedback.note ?? null }
      : null,
    narration: doc.narration?.text ? { text: doc.narration.text } : null,
    explanation: doc.explanation?.text ? { text: doc.explanation.text } : null,
    miniEvidence: compactEvidence(doc.evidence),
  };
}

/**
 * Just enough evidence for the card-sized glance.
 *
 * A stored evidence blob can carry two hundred points; a feed of six
 * cards has no business shipping twelve hundred of them to draw six
 * thumbnails. The full set is loaded only on the detail page.
 */
function compactEvidence(evidence) {
  if (!evidence?.kind) return null;
  if (evidence.kind === "two_group" && evidence.groups) {
    return {
      kind: "two_group",
      groups: {
        a: { median: evidence.groups.a?.median ?? 0, n: evidence.groups.a?.n ?? 0 },
        b: { median: evidence.groups.b?.median ?? 0, n: evidence.groups.b?.n ?? 0 },
      },
    };
  }
  return {
    kind: evidence.kind,
    points: (evidence.points ?? [])
      .slice(0, 40)
      .map((p) => ({ x: p.x ?? 0, y: p.y ?? 0 })),
  };
}

/**
 * Everything the Discoveries home needs in one round trip: the stored
 * feed, when the last run happened, and how much data the engine can
 * currently see.
 */
export async function getDiscoveriesData() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const userId = session.user.id;

  await connectDB();
  // Two indexed reads and nothing else. Coverage used to be computed
  // here too, and a ninety-day scan across six collections held up the
  // whole home page — including the money and habit sections, which do
  // not need it. It is now fetched from /api/patterns/readiness only if
  // the user opens pattern discovery.
  const [docs, lastRun] = await Promise.all([
    // The home feed shows live findings only; stale and dismissed ones
    // live in the archive at /app/discoveries.
    Insight.find({ userId, status: "active" }).lean(),
    PatternRun.findOne({ userId, error: null }).sort({ runAt: -1 }).lean(),
  ]);

  const lastRunAt = lastRun?.runAt ? new Date(lastRun.runAt).toISOString() : null;
  return {
    insights: docs.map(toFeedItem),
    readiness: null,
    meta: {
      lastRunAt,
      nextRunAt: lastRunAt
        ? new Date(new Date(lastRunAt).getTime() + RUN_TTL_HOURS * 3_600_000).toISOString()
        : null,
      // How many relationships the last run actually tested — the number
      // behind "we tested 34 things and none of them held up".
      hypothesesTested: lastRun?.hypotheses ?? 0,
      hasEverRun: Boolean(lastRun),
    },
  };
}

/** The archive: every insight the user has ever had, including lapsed ones. */
export async function getInsightArchive() {
  const session = await auth();
  if (!session?.user?.id) return [];
  await connectDB();
  const docs = await Insight.find({ userId: session.user.id }).lean();
  return docs.map(toFeedItem);
}

/**
 * One insight in full, including the evidence rows and strength history
 * the detail page charts.
 */
export async function getInsightDetail(id) {
  const session = await auth();
  if (!session?.user?.id) return null;
  await connectDB();

  const doc = await Insight.findOne({ _id: id, userId: session.user.id }).lean();
  if (!doc) return null;

  return {
    ...toFeedItem(doc),
    evidence: JSON.parse(JSON.stringify(doc.evidence ?? {})),
    strengthHistory: (doc.strengthHistory ?? []).map((h) => ({
      date: h.date ? new Date(h.date).toISOString() : null,
      value: h.value,
      n: h.n,
      qValue: h.qValue,
      confidence: h.confidence,
    })),
  };
}

/**
 * The briefing — planner checkmarks and spending, already turned into
 * plain sentences. Deterministic: no model is involved, so every number
 * in the text came from the rows below.
 *
 * The two halves run on different clocks on purpose. Habits are a weekly
 * practice and the planner itself is a week, so those stay Mon–today.
 * Money is monthly — rent, salary, subscriptions and every budget land
 * on a month — and it is measured in whichever calendar the user reads
 * their money in, so "this month" here means the same month the expenses
 * screen is showing them.
 *
 * Reads the planner week directly rather than through getPlannerWeek —
 * the briefing must never trigger the copy-forward side effect.
 */
export async function getWeeklyBriefing() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const userId = session.user.id;
  const name = session.user.name?.split(" ")[0] || "there";

  await connectDB();
  const wsKey = weekStartKey();
  const todayKey = toDateKey();
  // Days from Monday to today, inclusive — the days that could have a tick.
  const elapsedDays = Math.max(
    1,
    Math.min(
      7,
      Math.round(
        (new Date(`${todayKey}T12:00:00`) - new Date(`${wsKey}T12:00:00`)) /
          86_400_000
      ) + 1
    )
  );

  const lastWsKey = addDays(wsKey, -7);

  // The money window: this month to date, in the user's own calendar.
  const cal = await userCalendar(userId);
  const monthCursor = currentMonthCursor(cal, todayKey);
  const { from: monthFrom } = monthCursorRange(monthCursor);
  const { from: prevFrom, to: prevTo } = monthCursorRange(
    shiftMonthCursor(monthCursor, -1)
  );
  // Compare like with like — the same opening stretch of last month, or
  // the 3rd of every month would report a triumph.
  const monthElapsedDays = Math.max(1, dayDiff(monthFrom, todayKey) + 1);
  const prevSpanEnd = addDays(prevFrom, monthElapsedDays - 1);
  const prevCompareTo = prevSpanEnd < prevTo ? prevSpanEnd : prevTo;

  const [goals, lastWeekGoals, monthExpenses, lastMonthExpenses, categories] = await Promise.all([
    PlannerGoal.find({ userId, weekStart: wsKey }).sort({ createdAt: 1 }).lean(),
    // Last week's rows, only so a dropped habit's gap doesn't reset to
    // zero every Monday and read as if it were merely off to a slow start.
    PlannerGoal.find({ userId, weekStart: lastWsKey }).select("title days").lean(),
    Expense.find({
      userId,
      deletedAt: null,
      date: { $gte: monthFrom, $lte: todayKey },
    }).lean(),
    Expense.find({
      userId,
      deletedAt: null,
      date: { $gte: prevFrom, $lte: prevCompareTo },
    }).lean(),
    Category.find({ userId }).select("name icon").lean(),
  ]);

  const catMap = Object.fromEntries(categories.map((c) => [String(c._id), c]));
  const sum = (rows) => rows.reduce((s, e) => s + (e.amountPaisa || 0), 0);
  const monthPaisa = sum(monthExpenses);
  const lastMonthPaisa = sum(lastMonthExpenses);

  const byCategory = new Map();
  for (const e of monthExpenses) {
    const id = String(e.categoryId);
    byCategory.set(id, (byCategory.get(id) || 0) + (e.amountPaisa || 0));
  }
  let top = null;
  if (monthPaisa > 0) {
    for (const [id, paisa] of byCategory) {
      if (!top || paisa > top.paisa) {
        const cat = catMap[id];
        top = {
          name: cat?.name || "Uncategorised",
          paisa,
          share: paisa / monthPaisa,
        };
      }
    }
  }

  const goalsWithHistory = goals.map((goal) => ({
    ...goal,
    priorGap: trailingGap(lastWeekGoals.find((g) => g.title === goal.title)),
  }));

  return {
    habitNotes: orderNotes(buildHabitNotes(goalsWithHistory, elapsedDays, name)),
    moneyNotes: buildMoneyNotes({
      monthPaisa,
      lastMonthPaisa,
      lastMonthPartial: prevCompareTo < prevTo,
      top,
      categoryCount: byCategory.size,
      name,
    }),
    monthLabel: monthCursorLabel(monthCursor),
    hasGoals: goals.length > 0,
    elapsedDays,
  };
}

/**
 * Untouched days at the *end* of a finished week — how far back a gap
 * already ran before this week started. A week with any tick in it still
 * contributes the days after that tick.
 */
function trailingGap(goal) {
  if (!goal) return 0;
  const keys = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  let gap = 0;
  for (let i = keys.length - 1; i >= 0; i--) {
    if (goal.days?.[keys[i]] === "done") break;
    gap++;
  }
  return gap;
}

/**
 * The last seven days as Lifeline heights — the same composite the
 * dashboard draws, computed here from the signal layer so Discoveries
 * and the engine can never disagree about what a day contained.
 */
export async function getLifelineWeek() {
  const session = await auth();
  if (!session?.user?.id) return [];
  const to = toDateKey();
  const signals = await getDailySignals(session.user.id, addDays(to, -6), to);

  return signals.map((s) => {
    const habitScore = s.habitRate ?? 0;
    const journalScore = Math.min(s.journalWords / 150, 1);
    const value =
      s.habitsTracked > 0 ? habitScore * 0.6 + journalScore * 0.4 : journalScore;
    return { date: s.date, dow: s.dow, value, hasMood: s.hasMood };
  });
}
