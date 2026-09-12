import { withRoute, json, must } from "@/lib/api";
import { invalidateJournal } from "@/lib/cache";
import QuickNote from "@/models/QuickNote";

/** POST /api/journal/notes/[id]/undo — restore a soft-deleted note. */
export const POST = withRoute(
  { limit: "write", params: ["id"] },
  async ({ userId, params }) => {
    // `deletedAt: { $ne: null }` keeps this honest: restoring a note that was
    // never deleted is a 404, not a silent success.
    const note = must(
      await QuickNote.findOneAndUpdate(
        { _id: params.id, userId, deletedAt: { $ne: null } },
        { $set: { deletedAt: null } },
        { new: true }
      ).lean()
    );

    invalidateJournal(userId);

    return json(note);
  }
);
