import { withRoute, json } from "@/lib/api";
import { getEntitlements } from "@/lib/entitlements";

/**
 * GET /api/me — who is signed in, for the app shell.
 *
 * The shell used to resolve this in `app/app/layout.jsx`, which made every
 * screen under it server-rendered on demand: a layout that reads the session
 * cookie cannot be prerendered, and a route that cannot be prerendered cannot
 * be prefetched in full. That was the reason tapping a tab showed a skeleton
 * — Next had only ever fetched the loading state for those routes, and the
 * real screen still needed a round trip.
 *
 * Moving the answer here lets the shell be static and the tabs be prefetched
 * whole. It costs one request on open, which the browser caches for the rest
 * of the visit and the client keeps on the device between visits.
 *
 * Deliberately small: an id, a display name and the plan flag. This is what
 * the shell renders, and nothing here is worth more than it.
 */
export const GET = withRoute({ limit: "read" }, async ({ userId, session }) => {
  // Read from the database, not the JWT, so a plan change shows immediately.
  const { isPro } = await getEntitlements(userId);
  return json({
    id: userId,
    name: session.user.name ?? null,
    // The sidebar shows it under the name, and Profile opens on it.
    email: session.user.email ?? null,
    isPro,
  });
});
