import { json } from "@/lib/api";
import { z, objectId } from "@/lib/validation";
import { withAdminRoute } from "@/features/admin/guard";
import { FEEDBACK_PAGE_SIZE, listFeedback } from "@/features/feedback/admin-service";

const ListQuery = z.object({
  status: z.enum(["new", "read", "archived", "all"]).catch("new"),
  cursor: objectId.optional().catch(undefined),
  limit: z.coerce.number().int().positive().max(100).catch(FEEDBACK_PAGE_SIZE),
});

/**
 * GET /api/admin/feedback — the feedback inbox. Admin only (404 otherwise).
 *
 * Query: status (new|read|archived|all), cursor, limit
 * → { items: [{ id, message, type, email, userId, route, status, adminNote, createdAt }], nextCursor }
 */
export const GET = withAdminRoute(
  { limit: "read", query: ListQuery },
  async ({ query }) => json(await listFeedback(query))
);
