/**
 * Admin analytics.
 *
 * ## Derived, not tracked
 *
 * Every number here comes from data the app already stores. There is no
 * event pipeline, no analytics vendor, and nothing new written on each page
 * view. "Which features are used" is answered by counting the records those
 * features produce, which has three advantages over instrumentation: it needs
 * no new writes on the hot path, it is retroactive (it describes the whole
 * history, not the period since tracking was added), and it cannot leak
 * anything to a third party.
 *
 * The limitation is worth stating plainly: this measures **what people
 * create**, not what they look at. A user who reads their briefing daily but
 * never writes a journal entry shows as not using the journal. For deciding
 * what to build next — which is the question being asked — creation is the
 * more honest signal anyway, because a feature nobody puts data into is a
 * feature nobody has adopted.
 *
 * Server-only, but not `"use server"`, so pages and API routes can both call
 * these directly.
 */

import connectDB from "@/lib/mongoose";
import User from "@/models/User";
import Expense from "@/models/Expense";
import Budget from "@/models/Budget";
import Category from "@/models/Category";
import Debt from "@/models/Debt";
import FinancialGoal from "@/models/FinancialGoal";
import DailyJournal from "@/models/DailyJournal";
import QuickNote from "@/models/QuickNote";
import HabitLog from "@/models/HabitLog";
import Goal from "@/models/Goal";
import WeeklyGoal from "@/models/WeeklyGoal";
import PlannerGoal from "@/models/PlannerGoal";
import Transaction from "@/models/Transaction";
import SIP from "@/models/SIP";
import Insight from "@/models/Insight";
import Feedback from "@/models/Feedback";

const DAY = 24 * 60 * 60 * 1000;

/** `n` days ago. */
function daysAgo(n) {
  return new Date(Date.now() - n * DAY);
}

/**
 * The features to report on, each with how to count its records.
 *
 * `dateField` is what "recent" means for that collection — mostly
 * `createdAt`, but the string-dated collections have no usable Date field, so
 * they fall back to `createdAt` too (every document has timestamps).
 *
 * `area` groups them so the dashboard can show which *part* of the product is
 * carrying the app, not just which screen.
 */
const FEATURES = [
  { id: "expenses", label: "Expenses", area: "Money", model: () => Expense, filter: { deletedAt: null } },
  { id: "budgets", label: "Budgets", area: "Money", model: () => Budget },
  {
    id: "categories",
    label: "Custom categories",
    area: "Money",
    model: () => Category,
    // Every account is seeded with defaults, so counting all of them would
    // report 100% adoption of a feature nobody chose.
    filter: { isDefault: { $ne: true } },
  },
  { id: "debts", label: "Debts", area: "Money", model: () => Debt },
  { id: "savingsGoals", label: "Savings goals", area: "Money", model: () => FinancialGoal },
  { id: "journal", label: "Journal entries", area: "Journal", model: () => DailyJournal },
  { id: "quickNotes", label: "Quick notes", area: "Journal", model: () => QuickNote, filter: { deletedAt: null } },
  { id: "habits", label: "Habit logs", area: "Habits", model: () => HabitLog },
  { id: "goals", label: "Goals & milestones", area: "Habits", model: () => Goal },
  { id: "weeklyGoals", label: "Weekly goals", area: "Habits", model: () => WeeklyGoal },
  { id: "planner", label: "Planner", area: "Habits", model: () => PlannerGoal },
  { id: "portfolio", label: "Portfolio trades", area: "Wealth", model: () => Transaction },
  { id: "sips", label: "SIPs", area: "Wealth", model: () => SIP },
  { id: "insights", label: "Pattern discoveries", area: "Insight", model: () => Insight },
  { id: "feedback", label: "Feedback sent", area: "Product", model: () => Feedback },
];

/**
 * Users, records and recent records for one feature — in a single pass.
 *
 * Grouping by `userId` first and then counting the groups is what yields
 * distinct users without pulling any documents back.
 */
async function featureUsage(feature, since) {
  const Model = feature.model();
  const match = { ...(feature.filter ?? {}) };

  const [row] = await Model.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$userId",
        records: { $sum: 1 },
        recent: {
          $sum: { $cond: [{ $gte: ["$createdAt", since] }, 1, 0] },
        },
        lastUsedAt: { $max: "$createdAt" },
      },
    },
    {
      $group: {
        _id: null,
        users: { $sum: 1 },
        records: { $sum: "$records" },
        recentRecords: { $sum: "$recent" },
        activeUsers: { $sum: { $cond: [{ $gt: ["$recent", 0] }, 1, 0] } },
        lastUsedAt: { $max: "$lastUsedAt" },
      },
    },
  ]);

  return {
    id: feature.id,
    label: feature.label,
    area: feature.area,
    users: row?.users ?? 0,
    records: row?.records ?? 0,
    recentRecords: row?.recentRecords ?? 0,
    activeUsers: row?.activeUsers ?? 0,
    lastUsedAt: row?.lastUsedAt ?? null,
  };
}

/**
 * The full dashboard payload.
 *
 * @param {{recentDays?: number}} [options]
 */
export async function getAdminOverview({ recentDays = 30 } = {}) {
  await connectDB();

  const since = daysAgo(recentDays);
  const [day, week, month] = [daysAgo(1), daysAgo(7), daysAgo(30)];

  const [
    totalUsers,
    suspendedUsers,
    activeDay,
    activeWeek,
    activeMonth,
    newWeek,
    newMonth,
    neverSignedIn,
    byProvider,
    byRole,
    signupTrend,
    features,
  ] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ isSuspended: true }),
    User.countDocuments({ lastLoginAt: { $gte: day } }),
    User.countDocuments({ lastLoginAt: { $gte: week } }),
    User.countDocuments({ lastLoginAt: { $gte: month } }),
    User.countDocuments({ createdAt: { $gte: week } }),
    User.countDocuments({ createdAt: { $gte: month } }),
    // Signed up and never came back — the sharpest onboarding signal there is.
    User.countDocuments({ lastLoginAt: null }),
    User.aggregate([
      { $group: { _id: { $ifNull: ["$provider", "credentials"] }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    User.aggregate([
      { $group: { _id: { $ifNull: ["$role", "user"] }, count: { $sum: 1 } } },
    ]),
    // Signups per day for the last 30, for the trend strip.
    User.aggregate([
      { $match: { createdAt: { $gte: month } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Promise.all(FEATURES.map((f) => featureUsage(f, since))),
  ]);

  /**
   * Adoption as a share of all users.
   *
   * Guarded against a zero user count — on an empty database every feature
   * would otherwise report NaN% and the whole table would render as "NaN".
   */
  const withAdoption = features.map((f) => ({
    ...f,
    adoption: totalUsers > 0 ? Math.round((f.users / totalUsers) * 1000) / 10 : 0,
    /**
     * Records per adopting user — depth of use, not breadth.
     *
     * This is what separates "everyone tried it once" from "a few people live
     * in it", and those two need completely different product responses.
     */
    intensity: f.users > 0 ? Math.round((f.records / f.users) * 10) / 10 : 0,
  }));

  const ranked = [...withAdoption].sort(
    (a, b) => b.users - a.users || b.records - a.records
  );

  return {
    generatedAt: new Date().toISOString(),
    recentDays,
    users: {
      total: totalUsers,
      suspended: suspendedUsers,
      activeDay,
      activeWeek,
      activeMonth,
      newWeek,
      newMonth,
      neverSignedIn,
      // Share of all users who returned in the last week.
      weeklyActiveRate:
        totalUsers > 0 ? Math.round((activeWeek / totalUsers) * 1000) / 10 : 0,
      byProvider: Object.fromEntries(byProvider.map((r) => [r._id, r.count])),
      byRole: Object.fromEntries(byRole.map((r) => [r._id, r.count])),
    },
    signupTrend: signupTrend.map((d) => ({ date: d._id, count: d.count })),
    features: ranked,
    /** The headline answers to "what is loved" and "what is ignored". */
    mostUsed: ranked.filter((f) => f.users > 0).slice(0, 5),
    untouched: ranked.filter((f) => f.users === 0),
    /**
     * Adopted once and then abandoned: it has records, but none recently.
     * Distinct from untouched, and usually the more interesting problem —
     * somebody tried it and it did not hold them.
     */
    goneQuiet: ranked.filter((f) => f.records > 0 && f.recentRecords === 0),
  };
}

/**
 * One page of users for the management table.
 *
 * @param {object} options
 * @param {string} [options.q] search over name and email
 * @param {string} [options.role] filter by role
 * @param {number} [options.limit]
 * @param {number} [options.skip]
 */
export async function listUsers({ q, role, limit = 25, skip = 0 } = {}) {
  await connectDB();

  const filter = {};
  if (role) filter.role = role;

  if (q) {
    // Escaped, like every other user-supplied regex in the app — an
    // unbalanced paren here would 500 the admin page.
    const escaped = String(q).trim().slice(0, 64).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (escaped) {
      const rx = new RegExp(escaped, "i");
      filter.$or = [{ name: rx }, { email: rx }];
    }
  }

  const [users, total] = await Promise.all([
    User.find(filter)
      // Never select passwordHash — it has no business leaving the database,
      // and an admin screen is not an exception.
      .select("name email image provider linkedProviders role isSuspended createdAt lastLoginAt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Math.min(limit, 100))
      .lean(),
    User.countDocuments(filter),
  ]);

  return {
    users: users.map((u) => ({
      id: String(u._id),
      name: u.name,
      email: u.email,
      image: u.image ?? null,
      provider: u.provider ?? "credentials",
      linkedProviders: u.linkedProviders ?? [],
      role: u.role ?? "user",
      isSuspended: Boolean(u.isSuspended),
      createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : null,
      lastLoginAt: u.lastLoginAt ? new Date(u.lastLoginAt).toISOString() : null,
    })),
    total,
    limit,
    skip,
    hasMore: skip + users.length < total,
  };
}

/**
 * What one user has actually done — the per-user activity breakdown.
 *
 * Counts only. An admin screen must never render someone's journal entries or
 * expense notes: knowing they wrote 40 entries is what supporting them
 * requires, and reading the entries is not.
 *
 * @param {string} userId
 */
export async function getUserActivity(userId) {
  await connectDB();

  const counts = await Promise.all(
    FEATURES.map(async (feature) => {
      const Model = feature.model();
      const count = await Model.countDocuments({
        userId,
        ...(feature.filter ?? {}),
      });
      return { id: feature.id, label: feature.label, area: feature.area, count };
    })
  );

  return counts.sort((a, b) => b.count - a.count);
}

export { FEATURES };
