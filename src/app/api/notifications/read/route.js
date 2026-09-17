import { withRoute, json } from "@/lib/api";
import { z, objectId } from "@/lib/validation";
import Notification from "@/models/Notification";

const MarkRead = z.object({
  // Omitted marks everything read ("Mark all as read").
  ids: z.array(objectId).max(100).optional(),
});

/**
 * POST /api/notifications/read — mark notifications read.
 * Body: { ids? } — no ids means all of the caller's notifications.
 */
export const POST = withRoute({ limit: "write", body: MarkRead }, async ({ userId, input }) => {
  const filter = { userId, readAt: null };
  if (input.ids) filter._id = { $in: input.ids };
  await Notification.updateMany(filter, { $set: { readAt: new Date() } });
  return json({ ok: true });
});
