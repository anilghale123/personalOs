import mongoose from "mongoose";
import connectDB from "@/lib/mongoose";
import { pushConfigured, sendPush } from "@/lib/push";
import User from "@/models/User";
import Expense from "@/models/Expense";
import PlannerGoal from "@/models/PlannerGoal";
import PushSubscription from "@/models/PushSubscription";
import { recordNotifications } from "@/features/notifications/record";
import {
  buildGoalTimeReminder,
  buildReminder,
  daysBetween,
  goalTimeDue,
  nextGoalTimeAt,
  nepalClock,
  slotFor,
} from "./logic";

/** Parallel sends per batch — enough to be quick, few enough to be polite. */
const BATCH = 25;

/**
 * Send the 10 am / 8 pm reminders.
 *
 * Every user with a subscribed device is checked in a handful of bulk
 * queries (never one query per user), then each device gets the message
 * built for its owner — or nothing, if they're already done for the day.
 *
 * @param {{now?: Date, slot?: "morning"|"evening"}} [options]
 */
export async function runReminders({ now = new Date(), slot: forcedSlot } = {}) {
  if (!pushConfigured()) return { skipped: "push-not-configured" };
  await connectDB();

  const clock = nepalClock(now);
  const slot = forcedSlot ?? slotFor(clock.hour);
  const sentKey = `${clock.dateKey}:${slot}`;

  const subscriptions = await PushSubscription.find({
    lastSentKey: { $ne: sentKey },
  })
    .select("userId endpoint keys")
    .lean();
  if (!subscriptions.length) return { slot, date: clock.dateKey, sent: 0 };

  const userIds = [...new Set(subscriptions.map((s) => String(s.userId)))].map(
    (id) => new mongoose.Types.ObjectId(id)
  );

  const [users, loggedToday, lastExpense, weekGoals, lastPlanner] =
    await Promise.all([
      User.find({ _id: { $in: userIds }, isSuspended: { $ne: true } })
        .select("name")
        .lean(),
      Expense.distinct("userId", {
        userId: { $in: userIds },
        deletedAt: null,
        date: clock.dateKey,
      }),
      Expense.aggregate([
        { $match: { userId: { $in: userIds }, deletedAt: null } },
        { $group: { _id: "$userId", last: { $max: "$date" } } },
      ]),
      PlannerGoal.find({ userId: { $in: userIds }, weekStart: clock.weekStart })
        .select(`userId days.${clock.weekday}`)
        .lean(),
      PlannerGoal.aggregate([
        { $match: { userId: { $in: userIds } } },
        { $group: { _id: "$userId", last: { $max: "$updatedAt" } } },
      ]),
    ]);

  const logged = new Set(loggedToday.map(String));
  const lastEntryKey = new Map();
  const bump = (userId, key) => {
    const id = String(userId);
    if (!lastEntryKey.has(id) || lastEntryKey.get(id) < key) {
      lastEntryKey.set(id, key);
    }
  };
  for (const row of lastExpense) if (row.last) bump(row._id, row.last);
  for (const row of lastPlanner) {
    if (row.last) bump(row._id, nepalClock(new Date(row.last)).dateKey);
  }

  const goals = new Map();
  for (const goal of weekGoals) {
    const id = String(goal.userId);
    const tally = goals.get(id) ?? { total: 0, pending: 0 };
    tally.total += 1;
    if ((goal.days?.[clock.weekday] ?? "pending") === "pending") tally.pending += 1;
    goals.set(id, tally);
  }

  const messages = new Map();
  for (const user of users) {
    const id = String(user._id);
    const last = lastEntryKey.get(id);
    const tally = goals.get(id) ?? { total: 0, pending: 0 };
    messages.set(
      id,
      buildReminder({
        name: user.name,
        slot,
        expenseLoggedToday: logged.has(id),
        goalsToday: tally.total,
        goalsPending: tally.pending,
        // A future-dated expense must not read as negative days away.
        daysAway: last ? Math.max(0, daysBetween(last, clock.dateKey)) : null,
      })
    );
  }

  // The bell gets one entry per person, however many devices they have.
  await recordNotifications(
    [...messages]
      .filter(([, message]) => message)
      .map(([userId, message]) => ({
        userId,
        kind: "daily",
        title: message.title,
        body: message.body,
        url: message.url,
        dedupeKey: `daily:${sentKey}`,
      }))
  );

  let sent = 0;
  let removed = 0;
  let skipped = 0;
  for (let i = 0; i < subscriptions.length; i += BATCH) {
    await Promise.all(
      subscriptions.slice(i, i + BATCH).map(async (subscription) => {
        const message = messages.get(String(subscription.userId));
        if (!message) {
          skipped += 1; // nothing to say, or a suspended account
          return;
        }
        const result = await sendPush(subscription, message);
        if (result.ok) {
          sent += 1;
          await PushSubscription.updateOne(
            { _id: subscription._id },
            { $set: { lastSentKey: sentKey } }
          );
        } else if (result.gone) {
          removed += 1;
          await PushSubscription.deleteOne({ _id: subscription._id });
        }
      })
    );
  }

  return { slot, date: clock.dateKey, devices: subscriptions.length, sent, skipped, removed };
}

/**
 * Nudge people whose timed planner goals are still unchecked after their time
 * ("Wake up" at 6:00 not ticked by 6:00). Each goal is nudged at most once a
 * day, and every nudge lands in the in-app inbox (the bell) as well as going
 * out as a push to the owner's devices.
 *
 * Two callers:
 *   - the cron (`/api/cron/goal-reminders`), every few minutes, for everyone;
 *   - the bell (`/api/notifications`) with `userId`, whenever the app is open
 *     — so nudges show up while someone is using the app even with no
 *     scheduler running (local development, or a missed cron).
 *
 * Goals are claimed (stamped `timeRemindedOn`) before anything is sent, so two
 * overlapping runs can't both deliver the same nudge. A user with several
 * goals due in the same run gets one notification listing them.
 *
 * @param {{now?: Date, userId?: string}} [options]
 */
export async function runGoalTimeReminders({ now = new Date(), userId } = {}) {
  await connectDB();

  const clock = nepalClock(now);
  const candidates = await PlannerGoal.find({
    ...(userId ? { userId } : {}),
    weekStart: clock.weekStart,
    time: { $exists: true, $ne: null },
    timeRemindedOn: { $ne: clock.dateKey },
  })
    .select(`userId title time timeRemindedOn days.${clock.weekday}`)
    .lean();

  const due = candidates.filter((goal) => goalTimeDue(goal, clock));
  // For the open app's timer; only meaningful for a single user's goals.
  const nextAt = userId ? nextGoalTimeAt(candidates, clock) : undefined;
  if (!due.length) return { date: clock.dateKey, due: 0, sent: 0, nextAt };

  // Claim one goal at a time so a goal another run already took is skipped
  // rather than nudged twice.
  const claimed = [];
  for (const goal of due) {
    const res = await PlannerGoal.updateOne(
      { _id: goal._id, timeRemindedOn: { $ne: clock.dateKey } },
      { $set: { timeRemindedOn: clock.dateKey } }
    );
    if (res.modifiedCount) claimed.push(goal);
  }
  if (!claimed.length) return { date: clock.dateKey, due: 0, sent: 0, nextAt };

  const userIds = [...new Set(claimed.map((g) => String(g.userId)))].map(
    (id) => new mongoose.Types.ObjectId(id)
  );
  const push = pushConfigured();
  const [users, subscriptions] = await Promise.all([
    User.find({ _id: { $in: userIds }, isSuspended: { $ne: true } })
      .select("name")
      .lean(),
    push
      ? PushSubscription.find({ userId: { $in: userIds } })
          .select("userId endpoint keys")
          .lean()
      : [],
  ]);

  const messages = new Map();
  for (const user of users) {
    const id = String(user._id);
    const goals = claimed
      .filter((g) => String(g.userId) === id)
      .sort((a, b) => a.time.localeCompare(b.time));
    messages.set(id, buildGoalTimeReminder({ name: user.name, goals }));
  }

  await recordNotifications(
    [...messages]
      .filter(([, message]) => message)
      .map(([id, message]) => ({
        userId: id,
        kind: "goal-time",
        title: message.title,
        body: message.body,
        url: message.url,
      }))
  );

  let sent = 0;
  let removed = 0;
  for (let i = 0; i < subscriptions.length; i += BATCH) {
    await Promise.all(
      subscriptions.slice(i, i + BATCH).map(async (subscription) => {
        const message = messages.get(String(subscription.userId));
        if (!message) return; // suspended account
        const result = await sendPush(subscription, message);
        if (result.ok) {
          sent += 1;
        } else if (result.gone) {
          removed += 1;
          await PushSubscription.deleteOne({ _id: subscription._id });
        }
      })
    );
  }

  return {
    date: clock.dateKey,
    due: claimed.length,
    devices: subscriptions.length,
    sent,
    removed,
    nextAt,
    ...(push ? {} : { push: "not-configured" }),
  };
}
