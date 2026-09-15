import { json, must } from "@/lib/api";
import { z } from "@/lib/validation";
import { withAdminRoute } from "@/features/admin/guard";
import { log } from "@/lib/logger";
import Feedback, { FEEDBACK_STATUSES } from "@/models/Feedback";

const UpdateFeedback = z
  .object({
    status: z.enum(FEEDBACK_STATUSES).optional(),
    /** Internal note; send "" to clear. */
    adminNote: z
      .string()
      .max(2000, "Keep the note under 2000 characters.")
      .transform((s) => s.trim())
      .optional(),
  })
  .refine((v) => v.status !== undefined || v.adminNote !== undefined, {
    message: "Nothing to update.",
  });

/**
 * PATCH /api/admin/feedback/[id] — change triage status and/or the internal note.
 *
 * Body: { status?, adminNote? }  →  { ok: true, item: { id, status, adminNote } }
 */
export const PATCH = withAdminRoute(
  { limit: "write", params: ["id"], body: UpdateFeedback },
  async ({ actor, params, input }) => {
    const set = {};
    const unset = {};
    if (input.status !== undefined) set.status = input.status;
    if (input.adminNote !== undefined) {
      if (input.adminNote) set.adminNote = input.adminNote;
      else unset.adminNote = "";
    }

    const doc = must(
      await Feedback.findByIdAndUpdate(
        params.id,
        { ...(Object.keys(set).length && { $set: set }), ...(Object.keys(unset).length && { $unset: unset }) },
        { new: true, runValidators: true }
      )
        .select("status adminNote")
        .lean()
    );

    log.info("Admin updated feedback", {
      actorId: actor.id,
      feedbackId: params.id,
      status: set.status,
    });

    return json({
      ok: true,
      item: { id: String(doc._id), status: doc.status, adminNote: doc.adminNote ?? "" },
    });
  }
);
