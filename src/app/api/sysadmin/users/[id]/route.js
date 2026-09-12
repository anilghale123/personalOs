import { json, badRequest, forbidden, must } from "@/lib/api";
import { z, optionalText } from "@/lib/validation";
import { withAdminRoute } from "@/features/admin/guard";
import { log } from "@/lib/logger";
import User from "@/models/User";
import { ROLE_ORDER, canActOn, canManageRoles } from "@/lib/roles";

const UpdateUser = z
  .object({
    role: z.enum(ROLE_ORDER).optional(),
    isSuspended: z.boolean().optional(),
    suspendedReason: optionalText(300),
  })
  .refine((v) => v.role !== undefined || v.isSuspended !== undefined, {
    message: "Nothing to update.",
  });

/**
 * PATCH /api/sysadmin/users/[id] — change a user's role or suspend them.
 *
 * Two rules do the real work, and both are enforced here rather than in the
 * UI, because the UI is not a security boundary:
 *
 *   1. **You may only act on someone strictly below you.** That single
 *      comparison stops an admin demoting a superadmin, stops admins acting on
 *      each other, and — since equal rank is not strictly below — stops anyone
 *      acting on themselves. The last one matters most: without it the only
 *      superadmin could demote themselves and lock everybody out of the
 *      console permanently.
 *   2. **Only a superadmin may change a role at all.**
 *
 * Body: { role?, isSuspended?, suspendedReason? }
 */
export const PATCH = withAdminRoute(
  { limit: "write", params: ["id"], body: UpdateUser },
  async ({ actor, params, input }) => {
    const target = must(
      await User.findById(params.id)
        .select("name email role isSuspended tokenVersion")
        .lean()
    );

    const targetRole = target.role ?? "user";

    if (String(target._id) === actor.id) {
      throw badRequest(
        "You cannot change your own role or suspend yourself. Ask another super admin."
      );
    }

    if (!canActOn(actor.role, targetRole)) {
      throw forbidden(
        "You can only manage accounts with a lower role than your own."
      );
    }

    const set = {};

    if (input.role !== undefined) {
      if (!canManageRoles(actor.role)) {
        throw forbidden("Only a super admin can change roles.");
      }
      // Granting a role at or above your own would let one compromised
      // session mint a permanent peer.
      if (!canActOn(actor.role, input.role)) {
        throw forbidden("You cannot grant a role at or above your own.");
      }
      set.role = input.role;
    }

    if (input.isSuspended !== undefined) {
      set.isSuspended = input.isSuspended;
      set.suspendedAt = input.isSuspended ? new Date() : null;
      set.suspendedReason = input.isSuspended ? input.suspendedReason : undefined;
    }

    /**
     * Revoke the target's live sessions for either change.
     *
     * Suspension that leaves the existing session working is not suspension,
     * and a demoted admin must lose the console immediately rather than when
     * their token happens to expire. The `jwt` callback compares this on every
     * request, so bumping it ends every session they hold.
     */
    const update = {
      $set: set,
      $inc: { tokenVersion: 1 },
    };

    const updated = await User.findByIdAndUpdate(params.id, update, {
      new: true,
      runValidators: true,
    })
      .select("name email role isSuspended")
      .lean();

    // The audit line. Deliberately records who did what to whom — this is the
    // one place in the app where one person changes another's access.
    log.warn("Admin changed a user account", {
      actorId: actor.id,
      actorRole: actor.role,
      targetId: String(target._id),
      previousRole: targetRole,
      newRole: set.role ?? targetRole,
      suspended: set.isSuspended,
    });

    return json({
      ok: true,
      user: {
        id: String(updated._id),
        name: updated.name,
        role: updated.role,
        isSuspended: Boolean(updated.isSuspended),
      },
    });
  }
);
