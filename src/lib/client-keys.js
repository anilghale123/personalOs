/**
 * Client-generated idempotency keys for money-affecting writes.
 *
 * One key per submit *attempt*, not per retry: the point is that a retried
 * request carries the same key, so the server recognises it as the same
 * intent and does not append a second entry. Generating a fresh key inside
 * a retry loop would defeat the whole mechanism.
 *
 * `crypto.randomUUID` is available in every browser this app supports and
 * in Node 19+; the fallback exists only for a non-secure context (plain
 * HTTP on a LAN address), where it is still far beyond what is needed to
 * avoid a collision between one user's own submits.
 */
export function newIdempotencyKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
