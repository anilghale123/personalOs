/**
 * "Has this statement row already been imported?"
 *
 * Two signals, so detection does not hinge on one field being present:
 *
 *   1. **Fingerprint** — the exact key stored on every imported row.
 *   2. **Content** — same kind (expense/income), date, amount and description
 *      (stored as the note), for rows that have no fingerprint. That covers
 *      entries saved before fingerprints were persisted.
 *
 * Content matches are counted, not just tested: if a statement has two
 * identical NPR 100 top-ups on one day and only one exists, exactly one row
 * is treated as imported.
 */

import connectDB from "@/lib/mongoose";
import Expense from "@/models/Expense";
import Income from "@/models/Income";
import { normalizeDescription } from "./statement";

/**
 * @typedef {{fingerprint: string, date: string, direction: 'withdraw'|'deposit',
 *            paisa: number, description: string}} ImportItem
 */

function contentKey(kind, date, paisa, text) {
  return `${kind}|${date}|${paisa}|${normalizeDescription(text)}`;
}

/**
 * Pure matcher — exported for tests.
 * @param {ImportItem[]} items
 * @param {{fingerprints: Set<string>, existing: Array<{kind: string, date: string, amountPaisa: number, note?: string}>}} known
 * @returns {boolean[]} parallel to `items`
 */
export function markAlreadyImported(items, { fingerprints, existing }) {
  const remaining = new Map();
  for (const doc of existing) {
    const key = contentKey(doc.kind, doc.date, doc.amountPaisa, doc.note);
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }

  return items.map((item) => {
    if (fingerprints.has(item.fingerprint)) return true;
    const kind = item.direction === "withdraw" ? "expense" : "income";
    const key = contentKey(kind, item.date, item.paisa, item.description);
    const left = remaining.get(key) ?? 0;
    if (left > 0) {
      remaining.set(key, left - 1);
      return true;
    }
    return false;
  });
}

/**
 * @param {string} userId
 * @param {ImportItem[]} items
 * @returns {Promise<boolean[]>}
 */
export async function findAlreadyImported(userId, items) {
  if (!items.length) return [];
  await connectDB();

  const fingerprints = items.map((i) => i.fingerprint);
  const dates = [...new Set(items.map((i) => i.date))];
  const amounts = [...new Set(items.map((i) => i.paisa))];
  const live = { userId, deletedAt: null };
  const unfingerprinted = {
    ...live,
    date: { $in: dates },
    amountPaisa: { $in: amounts },
    fingerprint: { $exists: false },
  };

  const [fpExpenses, fpIncome, oldExpenses, oldIncome] = await Promise.all([
    Expense.find({ ...live, fingerprint: { $in: fingerprints } }).select("fingerprint").lean(),
    Income.find({ ...live, fingerprint: { $in: fingerprints } }).select("fingerprint").lean(),
    Expense.find(unfingerprinted).select("date amountPaisa note").lean(),
    Income.find(unfingerprinted).select("date amountPaisa note").lean(),
  ]);

  return markAlreadyImported(items, {
    fingerprints: new Set([...fpExpenses, ...fpIncome].map((d) => d.fingerprint)),
    existing: [
      ...oldExpenses.map((d) => ({ ...d, kind: "expense" })),
      ...oldIncome.map((d) => ({ ...d, kind: "income" })),
    ],
  });
}
