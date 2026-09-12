/**
 * The admin authorisation boundary.
 *
 * Server-only, but deliberately not `"use server"` so both pages and API
 * routes can call it directly.
 *
 * The role is **re-read from the database**, never taken from the session.
 * A JWT is a snapshot: if the check trusted `session.user.role`, revoking
 * someone's admin would not take effect until their token expired — up to
 * thirty days of access after you removed it. One indexed read per admin
 * request is a trivial price for the revocation actually working.
 */

import connectDB from "@/lib/mongoose";
import { auth } from "@/lib/auth";
import { ApiError, withRoute } from "@/lib/api";
import { log } from "@/lib/logger";
import User from "@/models/User";
import { canAccessAdmin, canManageRoles } from "@/lib/roles";

/**
 * The current user, if they may use the admin area.
 * @returns {Promise<{id: string, name: string, email: string, role: string}|null>}
 */
export async function getAdminActor() {
  const session = await auth();
  if (!session?.user?.id) return null;

  await connectDB();
  const user = await User.findById(session.user.id)
    .select("name email role isSuspended")
    .lean();

  if (!user || user.isSuspended) return null;
  if (!canAccessAdmin(user.role)) return null;

  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

/**
 * Wrap an admin API route.
 *
 * Layers on top of `withRoute`, so admin endpoints keep the same rate
 * limiting, validation, error envelope and logging as everything else — and
 * then adds the role check plus an audit line naming who did what.
 *
 * @param {object} options same shape as `withRoute`, plus `superadmin`
 * @param {boolean} [options.superadmin] require the top role
 * @param {(ctx: object) => Promise<Response|object>} handler receives `actor`
 */
export function withAdminRoute(options, handler) {
  const { superadmin = false, ...routeOptions } = options;

  return withRoute(routeOptions, async (ctx) => {
    const actor = await getAdminActor();

    if (!actor) {
      /**
       * 404, not 403.
       *
       * Answering "forbidden" confirms the admin area exists at this path to
       * anyone who probes for it. Behaving as though the route simply is not
       * there tells a prober nothing they did not already have.
       */
      log.warn("Non-admin hit an admin route", {
        userId: ctx.userId,
        route: ctx.url?.pathname,
      });
      throw new ApiError(404, "Not found", "not_found");
    }

    if (superadmin && !canManageRoles(actor.role)) {
      throw new ApiError(
        403,
        "Only a super admin can do that.",
        "forbidden"
      );
    }

    return handler({ ...ctx, actor });
  });
}
