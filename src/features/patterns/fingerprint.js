/**
 * Stable insight identity.
 *
 * A pattern is the same *thing* across runs when it comes from the same
 * detector with the same parameters — "Morning Run → next-day mood" on
 * Tuesday is the same insight as on Friday, just confirmed again. That
 * identity is what makes pattern history, confidence-through-time and the
 * weekly "did this hold?" check-in possible at all: each run upserts by
 * fingerprint instead of inserting, so history accumulates on one
 * document rather than scattering across many.
 *
 * The hash input is built from a stable stringification — key order in
 * `params` must never change the identity of a finding.
 */

import { createHash } from "node:crypto";

/**
 * JSON.stringify with object keys sorted, recursively. Two params objects
 * that mean the same thing must stringify identically however the
 * detector happened to assemble them.
 */
export function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  const body = keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",");
  return `{${body}}`;
}

/**
 * sha1(detectorId + '|' + stableStringify(params)) — collision-resistant
 * enough for a single user's insight set, and short enough to index.
 *
 * @param {string} detectorId
 * @param {object} [params]
 * @returns {string} 40-char hex
 */
export function fingerprint(detectorId, params = {}) {
  return createHash("sha1")
    .update(`${detectorId}|${stableStringify(params ?? {})}`)
    .digest("hex");
}

/**
 * The in-memory key for the same identity, used to look a candidate up in
 * the run's history map before anything is hashed or persisted. Built on
 * the same stable stringification so the two can never drift apart.
 */
export function historyKeyOf(detectorId, params = {}) {
  return `${detectorId}|${stableStringify(params ?? {})}`;
}
