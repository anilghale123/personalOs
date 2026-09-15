/**
 * From text lines to an import preview: detect the bank, parse, resolve
 * direction, validate the running balance, suggest categories, fingerprint.
 *
 * Pure apart from hashing, so the whole pipeline after PDF extraction is
 * unit tested.
 */

import crypto from "node:crypto";
import { toMinorUnits } from "@/lib/money";
import { suggestExpenseCategory, suggestIncomeCategory } from "@/features/wealth/categorize";
import { detectParser } from "./parsers";

export class StatementError extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.name = "StatementError";
    this.code = code;
  }
}

/** Lowercase alphanumerics only — stable across re-extraction whitespace quirks. */
export function normalizeDescription(description) {
  return String(description || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Dedupe key: date + direction + amount + normalised description, plus the
 * row's occurrence number among identical rows in the same statement.
 *
 * The occurrence number is what lets two genuinely identical transactions
 * (two NPR 100 top-ups on one day) both import, while re-importing the same
 * statement — or an overlapping one — still recognises each of them.
 */
export function fingerprintRows(rows) {
  const seen = new Map();
  return rows.map((row) => {
    const paisa = toMinorUnits(row.withdraw ?? row.deposit ?? 0);
    const base = `${row.date}|${row.direction}|${paisa}|${normalizeDescription(row.description)}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return crypto.createHash("sha256").update(`${base}|${n}`).digest("hex").slice(0, 40);
  });
}

const EPS = 0.005;

/**
 * @param {string[]} lines
 * @param {{rows?: Array}} [ctx] positioned cells, needed by the generic parser
 */
export function parseStatementLines(lines, ctx = {}) {
  if (!lines?.length || lines.join("").trim().length < 20) {
    throw new StatementError(
      "pdf_no_text",
      "Could not read any text from this PDF. If it is a scanned image, download the electronic statement from your bank instead."
    );
  }

  const parser = detectParser(lines, ctx);
  if (!parser) {
    throw new StatementError(
      "unsupported_statement",
      "Couldn't find a transaction table in this file. It needs columns for Date, Description, Withdraw (or Debit), Deposit (or Credit) and Balance."
    );
  }

  const parsed = parser.parse(lines, ctx);
  const warnings = [...parsed.warnings];

  let prevBalance = parsed.openingBalance;
  let balanceMismatches = 0;
  const rows = [];

  for (const row of parsed.rows) {
    let { withdraw, deposit } = row;
    const { balance } = row;

    // Resolve direction from the balance movement whenever the cells are
    // ambiguous (one amount, or one side dropped by extraction).
    if (prevBalance != null && balance != null) {
      const delta = Math.round((balance - prevBalance) * 100) / 100;
      if (row.ambiguous || (withdraw == null && deposit == null)) {
        const amount = withdraw ?? Math.abs(delta);
        if (delta < 0) {
          withdraw = amount;
          deposit = null;
        } else {
          deposit = amount;
          withdraw = null;
        }
      }
      const expected = prevBalance - (withdraw ?? 0) + (deposit ?? 0);
      if (Math.abs(expected - balance) > EPS) balanceMismatches++;
    }
    if (balance != null) prevBalance = balance;

    const hasWithdraw = withdraw != null && withdraw > 0;
    const hasDeposit = deposit != null && deposit > 0;
    if (hasWithdraw === hasDeposit) {
      warnings.push(`Row ${row.sn} (${row.date}) has no clear withdraw or deposit amount and was skipped.`);
      continue;
    }

    const direction = hasWithdraw ? "withdraw" : "deposit";
    rows.push({
      date: row.date,
      description: row.description || "(no description)",
      direction,
      withdraw: hasWithdraw ? withdraw : null,
      deposit: hasDeposit ? deposit : null,
      balance: balance ?? null,
      suggestedCategory:
        direction === "withdraw"
          ? suggestExpenseCategory(row.description) ?? "Miscellaneous"
          : suggestIncomeCategory(row.description),
    });
  }

  const fingerprints = fingerprintRows(rows);
  const transactions = rows.map((row, i) => ({ ...row, fingerprint: fingerprints[i] }));

  if (
    parsed.closingBalance != null &&
    prevBalance != null &&
    Math.abs(parsed.closingBalance - prevBalance) > EPS
  ) {
    warnings.push("The last row's balance does not match the closing balance — some rows may be missing.");
  }
  if (balanceMismatches) {
    warnings.push(`${balanceMismatches} row(s) don't add up against the running balance. Check them before importing.`);
  }
  if (!transactions.length) {
    warnings.push("No transactions were found in this statement.");
  }

  const confidence =
    !transactions.length || balanceMismatches > Math.max(1, transactions.length * 0.2)
      ? "low"
      : balanceMismatches || warnings.length
      ? "medium"
      : "high";

  // Not every statement prints its period; the rows themselves bound it.
  const dates = transactions.map((t) => t.date).sort();

  return {
    bank: parser.id,
    bankLabel: parsed.bankLabel ?? parser.label,
    accountHolder: parsed.accountHolder,
    accountMasked: parsed.accountMasked,
    currency: parsed.currency,
    fromDate: parsed.fromDate ?? dates[0] ?? null,
    toDate: parsed.toDate ?? dates[dates.length - 1] ?? null,
    openingBalance: parsed.openingBalance,
    closingBalance: parsed.closingBalance,
    confidence,
    warnings,
    transactions,
  };
}
