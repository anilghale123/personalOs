import { withRoute, json } from "@/lib/api";
import { captureException } from "@/lib/logger";
import Notification from "@/models/Notification";
import { runGoalTimeReminders } from "@/features/reminders/run";

const LIMIT = 30;

/**
 * GET /api/notifications — the bell: latest notifications and the unread count.
 *
 * Before reading, it checks the caller's own timed planner goals, so a goal
 * whose time just passed shows up here while the app is open even when no
 * scheduler is calling the cron (local development, a missed run). That
 * check is best-effort — if it fails, the inbox is still returned.
 */
export const GET = withRoute({ limit: "read" }, async ({ userId }) => {
  try {
    await runGoalTimeReminders({ userId });
  } catch (err) {
    captureException(err, { route: "GET /api/notifications", step: "goal-time" });
  }

  const [items, unread] = await Promise.all([
    Notification.find({ userId })
      .sort({ createdAt: -1 })
      .limit(LIMIT)
      .select("kind title body url readAt createdAt")
      .lean(),
    Notification.countDocuments({ userId, readAt: null }),
  ]);

  return json({ items, unread });
});
