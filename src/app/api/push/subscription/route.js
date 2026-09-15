import { withRoute, json } from "@/lib/api";
import { z } from "@/lib/validation";
import PushSubscription from "@/models/PushSubscription";

const endpoint = z
  .string()
  .url()
  .max(1000)
  .refine((u) => u.startsWith("https://"), "Push endpoints must be https.");

const Subscribe = z.object({
  endpoint,
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(100),
  }),
});

/**
 * POST /api/push/subscription — turn reminders on for this device.
 *
 * Idempotent: the settings screen re-sends the browser's subscription every
 * time it opens, which is how a subscription the cron dropped (after a
 * bounce) comes back. Keyed by endpoint, so a device that changes hands
 * moves to the signed-in user.
 */
export const POST = withRoute(
  { limit: "write", body: Subscribe },
  async ({ userId, input, request }) => {
    await PushSubscription.findOneAndUpdate(
      { endpoint: input.endpoint },
      {
        $set: {
          userId,
          keys: input.keys,
          userAgent: request.headers.get("user-agent")?.slice(0, 300),
        },
      },
      { upsert: true, runValidators: true }
    );
    return json({ ok: true });
  }
);

/**
 * DELETE /api/push/subscription — turn reminders off for this device.
 * Also called on sign-out, so a shared phone stops greeting the last user.
 */
export const DELETE = withRoute(
  { limit: "write", body: z.object({ endpoint }) },
  async ({ userId, input }) => {
    await PushSubscription.deleteOne({ endpoint: input.endpoint, userId });
    return json({ ok: true });
  }
);
