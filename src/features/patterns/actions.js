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
import { computeCoverage, getDailySignals } from "./signals";
import { renderStatement, DEFAULT_WINDOW_DAYS, MIN_ACTIVE_DAYS, READINESS_DOMAINS, RUN_TTL_HOURS } from "./constants";
import { addDays } from "./dates";
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
  const [docs, lastRun, readiness] = await Promise.all([
    // The home feed shows live findings only; stale and dismissed ones
    // live in the archive at /app/discoveries.
    Insight.find({ userId, status: "active" }).lean(),
    PatternRun.findOne({ userId, error: null }).sort({ runAt: -1 }).lean(),
    readinessFor(userId),
  ]);

  const lastRunAt = lastRun?.runAt ? new Date(lastRun.runAt).toISOString() : null;
  return {
    insights: docs.map(toFeedItem),
    readiness,
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
 * Per-domain coverage over the run window — what the "still learning"
 * panel is built from.
 *
 * Deliberately **not** exported: every export from a `"use server"` module
 * is a callable server action, and this one takes a `userId`. Keeping it
 * module-private means it can only ever be reached through a caller that
 * has already resolved the session.
 */
async function readinessFor(userId) {
  const to = toDateKey();
  const from = addDays(to, -(DEFAULT_WINDOW_DAYS - 1));
  const coverage = computeCoverage(await getDailySignals(userId, from, to));

  return {
    from,
    to,
    windowDays: DEFAULT_WINDOW_DAYS,
    activeDays: coverage.activeDays,
    minActiveDays: MIN_ACTIVE_DAYS,
    hasMinimumActivity: coverage.activeDays >= MIN_ACTIVE_DAYS,
    domains: READINESS_DOMAINS.map((domain) => {
      const covered = coverage[domain.id] ?? 0;
      return {
        id: domain.id,
        label: domain.label,
        unlocks: domain.unlocks,
        covered,
        target: domain.target,
        shortfall: Math.max(domain.target - covered, 0),
        ready: covered >= domain.target,
      };
    }),
  };
}

/**
 * The weekly briefing — this week's planner checkmarks and spending,
 * already turned into plain sentences. Deterministic: no model is
 * involved, so every number in the text came from the rows below.
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

  const [goals, weekExpenses, lastWeekExpenses, categories] = await Promise.all([
    PlannerGoal.find({ userId, weekStart: wsKey }).sort({ createdAt: 1 }).lean(),
    Expense.find({
      userId,
      deletedAt: null,
      date: { $gte: wsKey, $lte: todayKey },
    }).lean(),
    Expense.find({
      userId,
      deletedAt: null,
      date: { $gte: addDays(wsKey, -7), $lte: addDays(wsKey, -1) },
    }).lean(),
    Category.find({ userId }).select("name icon").lean(),
  ]);

  const catMap = Object.fromEntries(categories.map((c) => [String(c._id), c]));
  const sum = (rows) => rows.reduce((s, e) => s + (e.amountPaisa || 0), 0);
  const weekPaisa = sum(weekExpenses);
  const lastWeekPaisa = sum(lastWeekExpenses);

  const byCategory = new Map();
  for (const e of weekExpenses) {
    const id = String(e.categoryId);
    byCategory.set(id, (byCategory.get(id) || 0) + (e.amountPaisa || 0));
  }
  let top = null;
  if (weekPaisa > 0) {
    for (const [id, paisa] of byCategory) {
      if (!top || paisa > top.paisa) {
        const cat = catMap[id];
        top = {
          name: cat?.name || "Uncategorised",
          paisa,
          share: paisa / weekPaisa,
        };
      }
    }
  }

  return {
    habitNotes: orderNotes(buildHabitNotes(goals, elapsedDays, name)),
    moneyNotes: buildMoneyNotes({
      weekPaisa,
      lastWeekPaisa,
      top,
      categoryCount: byCategory.size,
      name,
    }),
    hasGoals: goals.length > 0,
    elapsedDays,
  };
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
