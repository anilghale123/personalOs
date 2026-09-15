/**
 * Response shaping — "send only what the screen needs".
 *
 * `.lean()` documents carry everything in the collection: `userId`, `__v`,
 * soft-delete markers, internal fingerprints. None of that belongs in a
 * response, and returning whole documents means every new internal field
 * silently becomes part of the public API. Routes build responses through an
 * explicit allowlist instead, so adding a field to a model exposes nothing
 * until someone deliberately adds it here.
 */

import { plain } from "@/lib/serialize";

/**
 * Copy only `fields` from a document, JSON-safe.
 *
 * Missing and `undefined` fields are omitted rather than sent as null, so a
 * DTO never grows keys the document did not have.
 *
 * @template T
 * @param {T|null|undefined} doc
 * @param {readonly string[]} fields
 * @returns {Partial<T>|null}
 */
export function pick(doc, fields) {
  if (!doc) return null;
  const out = {};
  for (const field of fields) {
    if (doc[field] !== undefined) out[field] = doc[field];
  }
  return plain(out);
}

/**
 * Build a DTO mapper for a fixed field list.
 * @param {readonly string[]} fields
 * @returns {(doc: object) => object}
 */
export function dto(fields) {
  const frozen = Object.freeze([...fields]);
  const map = (doc) => pick(doc, frozen);
  map.fields = frozen;
  return map;
}

/** Stringify an ObjectId-ish value, or null. */
export function toId(value) {
  return value == null ? null : String(value);
}
