import { withRoute, json, must } from "@/lib/api";
import { z, text } from "@/lib/validation";
import { invalidateJournal } from "@/lib/cache";
import { NOTE_TYPES } from "@/features/patterns/constants";
import QuickNote from "@/models/QuickNote";

const UpdateNote = z
  .object({
    // Capped: note content is stored raw and rendered back, so an unbounded
    // field is both a storage and a future-XSS problem.
    content: text(5000)
      .pipe(z.string().min(1, "Note content cannot be empty."))
      .optional(),
    pinned: z.boolean().optional(),
    // Previously any string was accepted and Mongoose rejected it later as a
    // 500; the enum turns that into a 400 with a usable message.
    type: z.enum(NOTE_TYPES).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "Nothing to update.",
  });

/**
 * PATCH /api/journal/notes/[id]
 * Inline-edit a note, toggle its pin, or change its type.
 * Body: { content?, pinned?, type? }
 */
export const PATCH = withRoute(
  { limit: "write", params: ["id"], body: UpdateNote },
  async ({ userId, params, input }) => {
    const update = Object.fromEntries(
      Object.entries(input).filter(([, v]) => v !== undefined)
    );

    const note = must(
      await QuickNote.findOneAndUpdate(
        { _id: params.id, userId, deletedAt: null },
        { $set: update },
        { new: true, runValidators: true }
      ).lean()
    );

    invalidateJournal(userId);

    return json(note);
  }
);

/**
 * DELETE /api/journal/notes/[id]
 * Soft delete — the note survives as deletedAt so Undo can restore it.
 */
export const DELETE = withRoute(
  { limit: "write", params: ["id"] },
  async ({ userId, params }) => {
    must(
      await QuickNote.findOneAndUpdate(
        { _id: params.id, userId, deletedAt: null },
        { $set: { deletedAt: new Date() } },
        { new: true }
      ).lean()
    );

    invalidateJournal(userId);

    return json({ ok: true });
  }
);
