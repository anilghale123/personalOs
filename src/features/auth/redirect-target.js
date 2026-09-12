/**
 * Resolving the post-sign-in destination.
 *
 * The middleware appends `?next=` when it bounces an unauthenticated visitor
 * off a protected page, so signing in returns them where they were going --
 * including the installed app, whose `start_url` is `/app`.
 *
 * Echoing that value into a redirect unchecked is an open redirect, and the
 * moment right after authentication is the worst possible time for one: the
 * user has just proven they trust this page, and a convincing copy of it
 * would be handed their attention.
 *
 * Extracted from the form so the rules are testable on their own.
 */

/** Where to go when there is no valid destination. */
export const DEFAULT_DESTINATION = "/app";

/**
 * A base that can never be a real origin, so any `next` that resolves away
 * from it is provably trying to leave the site.
 */
const SENTINEL_ORIGIN = "http://redirect-check.invalid";

/**
 * Resolve a `?next=` value to a safe same-site path.
 *
 * Uses the URL parser rather than hand-written string checks. That matters:
 * browsers strip tabs and newlines out of a URL before parsing it, and
 * normalise backslashes to forward slashes. So a backslash-prefixed host, or
 * one hidden behind an embedded newline, survives a naive `startsWith("/")`
 * test and then navigates off-site anyway. Parsing against a sentinel origin
 * and rejecting anything whose origin moved catches every such variant
 * without having to enumerate them.
 *
 * @param {string|null|undefined} next raw `?next=` value
 * @returns {string} a safe same-site path
 */
export function safeRedirect(next) {
  if (typeof next !== "string" || next.length === 0) {
    return DEFAULT_DESTINATION;
  }

  /**
   * Require a leading slash before parsing.
   *
   * The middleware only ever writes an absolute path, so anything else did not
   * come from us. A relative value like "app/budget" would resolve safely to
   * "/app/budget", but accepting shapes we never generate widens the surface
   * for no benefit.
   */
  if (!next.startsWith("/")) return DEFAULT_DESTINATION;

  let url;
  try {
    url = new URL(next, SENTINEL_ORIGIN);
  } catch {
    // Not a parseable URL at all.
    return DEFAULT_DESTINATION;
  }

  // Resolved somewhere other than this site.
  if (url.origin !== SENTINEL_ORIGIN) return DEFAULT_DESTINATION;

  // A path is required; "?x=1" alone resolves to the sentinel root, which is
  // not a destination the caller asked for.
  if (!url.pathname.startsWith("/")) return DEFAULT_DESTINATION;

  // Never bounce back to an auth screen -- that is a redirect loop.
  if (/^\/(login|signup|reset-password)(\/|$)/.test(url.pathname)) {
    return DEFAULT_DESTINATION;
  }

  return `${url.pathname}${url.search}${url.hash}`;
}
