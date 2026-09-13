import { cache } from "react";
import { auth } from "@/lib/auth";

/**
 * The signed-in session, resolved **once per request**.
 *
 * This exists because `auth()` is not free any more. The `jwt` callback reads
 * the user's `tokenVersion`, `role` and `isSuspended` from the database on
 * every call — which is what makes revoking a session or an admin role take
 * effect immediately instead of whenever the token happens to expire. That
 * trade is worth keeping.
 *
 * What is not worth keeping is paying it repeatedly. Every server action
 * resolves its own session, because a `"use server"` export must never take a
 * user id from its caller. One page render therefore fans out to six or more
 * independent `auth()` calls — the Money layout alone runs five actions — and
 * each was a separate round trip to Atlas. Measured on three page renders:
 * **41 `users.findOne` queries**, all asking the same question.
 *
 * React's `cache()` is scoped to a single request, so the first caller pays
 * for the lookup and the rest read the memoised result. Nothing about the
 * security model changes: the check still happens on every request, just once
 * per request rather than once per caller.
 *
 * Use this everywhere in the request path. `auth()` stays the right call in
 * the middleware and in NextAuth's own handlers, which run outside a render.
 */
export const getSession = cache(async () => auth());

/**
 * The current user's id, or null.
 *
 * The overwhelmingly common thing callers actually want, and it keeps the
 * `session?.user?.id` dance out of every action.
 */
export const getUserId = cache(async () => {
  const session = await getSession();
  return session?.user?.id ?? null;
});
