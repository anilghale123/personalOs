import mongoose from "mongoose";
import connectDB from "@/lib/mongoose";
import { pushConfigured, sendPush } from "@/lib/push";
import User from "@/models/User";
import Expense from "@/models/Expense";
import PlannerGoal from "@/models/PlannerGoal";
import PushSubscription from "@/models/PushSubscription";
import { buildReminder, daysBetween, nepalClock, slotFor } from "./logic";

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
