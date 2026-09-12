/**
 * Making database results safe to hand to a client component.
 *
 * `.lean()` already returns plain objects, but their `_id` is an ObjectId and
 * their dates are `Date` instances, neither of which crosses the
 * server/client boundary. The previous approach — `JSON.parse(JSON.stringify(doc))`
 * — worked, but allocated a second complete copy of every payload and did a
 * full parse of it, which is measurable on a year of habit logs fetched on
 * every page visit.
 *
 * Its own module rather than living in an action file, because a `"use server"`
 * module may only export async functions.
 */

/**
 * Convert BSON values to JSON-safe ones, recursively.
 *
 * Semantics deliberately match what `JSON.stringify` did, so this is a drop-in
 * replacement:
 *   - `Date` → ISO string
 *   - ObjectId (and any BSON type) → its string form
 *   - `undefined` properties are **dropped**, not converted to null — a
 *     component reading `value ?? fallback` behaves differently against null
 *   - everything else passes through by value
 *
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function plain(value) {
  if (Array.isArray(value)) return value.map(plain);
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  // Buffer / Binary and friends: stringify rather than emit a byte array.
  if (value._bsontype) return String(value);

  const out = {};
  for (const [key, v] of Object.entries(value)) {
    if (v === undefined) continue;
    if (v === null) out[key] = null;
    else if (v instanceof Date) out[key] = v.toISOString();
    else if (typeof v === "object" && v._bsontype) out[key] = String(v);
    else if (typeof v === "object") out[key] = plain(v);
    else out[key] = v;
  }
  return out;
}
