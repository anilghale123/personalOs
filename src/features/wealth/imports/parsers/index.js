/**
 * Statement parser registry.
 *
 * Each parser module exports `{ id, label, detect(lines, ctx), parse(lines, ctx) }`,
 * where `ctx.rows` holds positioned cells (from pdf-text.js or csv.js) and
 * `parse` returns header fields plus `rows` of
 * `{ sn, date, time, description, withdraw, deposit, balance }`.
 *
 * Bank-specific parsers come first; `generic-table` is the fallback that
 * reads any statement with Date / Description / Withdraw (Debit) /
 * Deposit (Credit) / Balance columns. Add a dedicated parser only for a bank
 * whose layout the generic one gets wrong.
 */

import * as citizenBank from "./citizen-bank";
import * as genericTable from "./generic-table";

export const PARSERS = [citizenBank, genericTable];

export const PARSER_IDS = PARSERS.map((p) => p.id);

/**
 * @param {string[]} lines
 * @param {{rows?: Array}} [ctx]
 */
export function detectParser(lines, ctx = {}) {
  return PARSERS.find((p) => p.detect(lines, ctx)) ?? null;
}

/** @param {string} id */
export function getParser(id) {
  return PARSERS.find((p) => p.id === id) ?? null;
}
