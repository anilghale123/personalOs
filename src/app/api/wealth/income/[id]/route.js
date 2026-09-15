import { withRoute, json, must } from "@/lib/api";
import { invalidateMoney } from "@/lib/cache";
import Income from "@/models/Income";

/** DELETE /api/wealth/income/[id] — soft delete.  →  { ok: true } */
export const DELETE = withRoute(
  { limit: "write", params: ["id"] },
  async ({ userId, params }) => {
    must(
      await Income.findOneAndUpdate(
        { _id: params.id, userId, deletedAt: null },
        { $set: { deletedAt: new Date() } }
      )
        .select("_id")
        .lean()
    );
    invalidateMoney(userId);
    return json({ ok: true });
  }
);
