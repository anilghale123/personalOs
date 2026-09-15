/**
 * Statement parser registry.
 *
 * Each parser module exports `{ id, label, detect(lines), parse(lines) }`,
 * where `parse` returns header fields plus `rows` of
 * `{ sn, date, time, description, withdraw, deposit, balance }`. Adding a
 * bank (or an eSewa/Khalti export) is a new module appended here — nothing
 * downstream changes.
 *
 * Order matters only if two detectors could both claim a file; keep the
 * stricter ones first.
 */

import * as citizenBank from "./citizen-bank";

export const PARSERS = [citizenBank];

export const PARSER_IDS = PARSERS.map((p) => p.id);

/** @param {string[]} lines */
export function detectParser(lines) {
  return PARSERS.find((p) => p.detect(lines)) ?? null;
}

/** @param {string} id */
export function getParser(id) {
  return PARSERS.find((p) => p.id === id) ?? null;
}
