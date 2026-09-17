import { withRoute, json, badRequest } from "@/lib/api";
import { pushConfigured, sendPush } from "@/lib/push";
import { firstName } from "@/features/reminders/logic";
import User from "@/models/User";
import PushSubscription from "@/models/PushSubscription";
import { recordNotifications } from "@/features/notifications/record";

/**
 * POST /api/push/test — send a sample reminder to the caller's devices, so
 * they can see it works (on iPhone especially) without waiting for 8 pm.
 */
export const POST = withRoute({ limit: "write" }, async ({ userId }) => {
  if (!pushConfigured()) throw badRequest("Reminders aren't set up on this server yet.");

  const [user, subscriptions] = await Promise.all([
    User.findById(userId).select("name").lean(),
    PushSubscription.find({ userId }).select("endpoint keys").lean(),
  ]);
  if (!subscriptions.length) throw badRequest("Turn reminders on for this device first.");

  const message = {
    title: "Reminders are on",
    body: `${firstName(user?.name)}, this is how your 10 am and 8 pm check-ins will look.`,
    url: "/app",
    tag: "reminder-test",
  };
  // Also in the bell, so a push the OS hid (Focus Assist, blocked site
  // notifications) still shows it was sent.
  await recordNotifications([{ userId, kind: "test", ...message }]);

  const results = await Promise.all(
    subscriptions.map(async (subscription) => {
      const result = await sendPush(subscription, message);
      if (result.gone) await PushSubscription.deleteOne({ _id: subscription._id });
      return result.ok;
    })
  );

  return json({ sent: results.filter(Boolean).length });
});
