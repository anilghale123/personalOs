/**
 * Any bank's statement table — the fallback when no bank-specific parser
 * claims the file.
 *
 * Nepali bank statements differ in layout but share the same columns under
 * different names:
 *
 *   date         Transaction Date · Txn Date · Date · Value Date · Miti
 *   description  Description · Particulars · Narration · Details · Remarks
 *   withdraw     Withdraw · Withdrawal · Debit · Dr
 *   deposit      Deposit · Credit · Cr
 *   balance      Balance · Running Balance
 *
 * The header row is found by those names, and each column's horizontal
 * extent is taken from its header cell. Every later cell is placed under the
 * nearest column — so a blank Withdraw or Deposit cell is simply absent,
 * rather than shifting the amounts along as it would in plain text. Columns
 * we don't import (Cheque No, Ref No, S.N) are registered too, so their
 * numbers are ignored instead of drifting into Debit. That is what makes one
 * parser work across banks.
 *
 * Needs positioned rows (`ctx.rows` from pdf-text.js or csv.js).
 */

import { parseStatementDate } from "../dates";
import { maskAccount } from "./citizen-bank";

export const id = "generic";
export const label = "Bank statement";

/** Checked in this order per header cell — "Transaction Date" is a date, not a description. */
const COLUMN_TESTS = [
  ["balance", /balance/i],
  ["withdraw", /withdraw|debit|^dr\.?$|paid out|money out/i],
  ["deposit", /deposit|credit|^cr\.?$|paid in|money in/i],
  ["date", /\bdate\b|\bmiti\b|मिति/i],
  ["description", /descript|particular|narration|\bdetails?\b|remarks|transaction/i],
];

/** Header names of columns we don't import, but must recognise. */
const OTHER_HEADER = /^(s\.?\s*n\.?|sn|sl\.?\s*no\.?|#|ref(erence)?(\s*no\.?)?|cheque(\s*no\.?)?|chq\.?(\s*no\.?)?|instrument(\s*no\.?)?|branch|tran(saction)?\s*id|voucher(\s*no\.?)?|code)$/i;

const OPENING_ROW = /opening\s+balance|balance\s+b\/?f|brought\s+forward|previous\s+balance/i;
const CLOSING_ROW = /closing\s+balance|balance\s+c\/?f|carried\s+forward|^total\b|grand\s+total|total\s+(debit|credit|withdraw|deposit)/i;
const TIME_ONLY = /^\d{1,2}:\d{2}(:\d{2})?(\s*[ap]m)?$/i;

const KNOWN_BANKS = [
  [/nabil/i, "Nabil Bank"],
  [/nic\s*asia/i, "NIC Asia Bank"],
  [/global\s*ime/i, "Global IME Bank"],
  [/nepal\s+investment\s+mega|\bnimb\b/i, "Nepal Investment Mega Bank"],
  [/himalayan\s+bank/i, "Himalayan Bank"],
  [/standard\s+chartered/i, "Standard Chartered"],
  [/everest\s+bank/i, "Everest Bank"],
  [/kumari\s+bank/i, "Kumari Bank"],
  [/laxmi\s+sunrise|laxmi\s+bank|sunrise\s+bank/i, "Laxmi Sunrise Bank"],
  [/prabhu\s+bank/i, "Prabhu Bank"],
  [/machhapuchchhre/i, "Machhapuchchhre Bank"],
  [/siddhartha\s+bank/i, "Siddhartha Bank"],
  [/sanima\s+bank/i, "Sanima Bank"],
  [/\bnmb\s+bank/i, "NMB Bank"],
  [/prime\s+commercial/i, "Prime Commercial Bank"],
  [/rastriya\s+banijya|\brbb\b/i, "Rastriya Banijya Bank"],
  [/nepal\s+bank\s+(limited|ltd)/i, "Nepal Bank"],
  [/agricultural\s+development\s+bank|\badbl\b/i, "Agricultural Development Bank"],
  [/nepal\s+sbi/i, "Nepal SBI Bank"],
  [/citizens?\s+bank/i, "Citizens Bank"],
];

/* ------------------------------------------------------------------ */
/* Cells                                                               */
/* ------------------------------------------------------------------ */

/**
 * An amount cell: "5,000.00", "5000", "Rs. 500", "(500.00)", "1,200.00 Dr".
 * @returns {{value: number|null, empty: boolean}}
 */
export function parseMoneyCell(text) {
  const t = String(text ?? "").trim();
  if (!t || /^[-–—]+$/.test(t) || /^n\/?a$/i.test(t)) return { value: null, empty: true };
  const m = t.match(/^(?:rs\.?|npr|nrs\.?)?\s*\(?\s*-?\s*([\d,]+(?:\.\d{1,2})?)\s*\)?\s*(?:dr|cr)?\.?$/i);
  if (!m) return { value: null, empty: false };
  // Grouping must be real thousands separators (incl. Indian 1,00,000), or it isn't money.
  if (m[1].includes(",") && !/^\d{1,3}(,\d{2,3})*(\.\d{1,2})?$/.test(m[1])) return { value: null, empty: false };
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? { value: n, empty: false } : { value: null, empty: false };
}

function center(cell) {
  return (cell.start + cell.end) / 2;
}

function extent(cell) {
  return { start: cell.start, end: cell.end, center: center(cell) };
}

/**
 * Nearest column by start, centre or end — covers left, centred and right
 * alignment.
 * @param {{start: number, end: number}} cell
 * @param {Array<[string, {start: number, end: number, center: number}]>} candidates
 */
function nearestColumn(cell, candidates) {
  let best = null;
  let bestDistance = Infinity;
  for (const [key, col] of candidates) {
    const d = Math.min(
      Math.abs(center(cell) - col.center),
      Math.abs(cell.end - col.end),
      Math.abs(cell.start - col.start)
    );
    if (d < bestDistance) {
      bestDistance = d;
      best = key;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */

/** @returns {{columns: object, others: object[]}|null} */
function headerFromCells(cells) {
  const found = {};
  const dates = [];
  const others = [];
  for (const cell of cells) {
    if (cell.text.length > 32) continue; // a sentence, not a column name
    const match = COLUMN_TESTS.find(([, re]) => re.test(cell.text));
    if (!match) {
      if (OTHER_HEADER.test(cell.text)) others.push(extent(cell));
      continue;
    }
    const [key] = match;
    if (key === "date") dates.push(cell);
    else if (!found[key]) found[key] = cell;
  }
  if (dates.length) {
    found.date = dates.find((c) => /tran|txn|posting|miti|मिति/i.test(c.text)) ?? dates[0];
    // A second date column (Value Date) is just another column to ignore.
    for (const c of dates) if (c !== found.date) others.push(extent(c));
  }
  if (!found.date || !found.withdraw || !found.deposit || found.withdraw === found.deposit) return null;

  return {
    columns: Object.fromEntries(Object.entries(found).map(([key, c]) => [key, extent(c)])),
    others,
  };
}

/** Merge a wrapped header ("Transaction" over "Date") into one set of cells. */
function mergeCells(top, bottom) {
  const merged = top.map((c) => ({ ...c }));
  for (const cell of bottom) {
    const over = merged.find((m) => cell.start < m.end && cell.end > m.start);
    if (over) {
      over.text = `${over.text} ${cell.text}`;
      over.start = Math.min(over.start, cell.start);
      over.end = Math.max(over.end, cell.end);
    } else {
      merged.push({ ...cell });
    }
  }
  return merged.sort((a, b) => a.start - b.start);
}

/** @returns {{index: number, span: number, columns: object, others: object[]}|null} */
export function findHeader(rows) {
  for (let i = 0; i < rows.length; i++) {
    const single = headerFromCells(rows[i].cells);
    if (single) return { index: i, span: 1, ...single };

    const next = rows[i + 1];
    if (next && next.page === rows[i].page && Math.abs(next.y - rows[i].y) <= rows[i].size * 1.8) {
      const merged = headerFromCells(mergeCells(rows[i].cells, next.cells));
      if (merged) return { index: i, span: 2, ...merged };
    }
  }
  return null;
}

/** A header repeated at the top of a later page. */
function isHeaderLike(row) {
  return (
    row.cells.length >= 2 &&
    row.cells.every(
      (c) => c.text.length <= 32 && (COLUMN_TESTS.some(([, re]) => re.test(c.text)) || OTHER_HEADER.test(c.text))
    )
  );
}

/* ------------------------------------------------------------------ */
/* Statement header fields                                             */
/* ------------------------------------------------------------------ */

function field(text, re) {
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

function readHeaderFields(lines) {
  const head = lines.slice(0, 40).join("\n");
  const amount = (re) => {
    const raw = field(head, re);
    return raw == null ? null : parseMoneyCell(raw).value;
  };
  const dateAfter = (re) => {
    const raw = field(head, re);
    return raw ? parseStatementDate(raw)?.date ?? null : null;
  };

  const accountNumber = field(head, /(?:account|a\/c|ac)\s*(?:number|no\.?|#)\s*[:\-]?\s*([0-9][0-9A-Z-]{5,})/i);

  return {
    bankLabel: KNOWN_BANKS.find(([re]) => re.test(head))?.[1] ?? label,
    accountHolder: field(
      head,
      /(?:account\s+holder['’]?s?\s+name|account\s+name|customer\s+name|name\s+of\s+(?:the\s+)?account\s+holder)\s*[:\-]?\s*(.+?)(?:\s{2,}|\n|$)/i
    ),
    accountMasked: maskAccount(accountNumber),
    currency: field(head, /\b(NPR|USD|INR|EUR|GBP|AUD)\b/) || "NPR",
    fromDate: dateAfter(/\bfrom(?:\s+date)?\s*[:\-]?\s*(.{6,24}?)(?:\s{2,}|\s+to\b|\n|$)/i),
    toDate: dateAfter(/\bto(?:\s+date)?\s*[:\-]?\s*(.{6,24}?)(?:\s{2,}|\n|$)/i),
    openingBalance: amount(/opening\s+balance\s*[:\-]?\s*((?:npr|rs\.?)?\s*[\d,]+(?:\.\d{1,2})?)/i),
    closingBalance: amount(/closing\s+balance\s*[:\-]?\s*((?:npr|rs\.?)?\s*[\d,]+(?:\.\d{1,2})?)/i),
  };
}

/* ------------------------------------------------------------------ */
/* Parser interface                                                    */
/* ------------------------------------------------------------------ */

/**
 * @param {string[]} _lines
 * @param {{rows?: Array}} [ctx]
 */
export function detect(_lines, ctx = {}) {
  return Boolean(ctx.rows?.length && findHeader(ctx.rows));
}

/**
 * @param {string[]} lines
 * @param {{rows: Array}} ctx
 */
export function parse(lines, ctx = {}) {
  const rows = ctx.rows ?? [];
  const header = findHeader(rows);
  const fields = readHeaderFields(lines);
  const warnings = [];

  if (!header) {
    return { bank: id, ...fields, rows: [], warnings: ["Could not find the transaction table header."] };
  }

  const { columns, others } = header;
  const amountKeys = ["withdraw", "deposit", "balance"].filter((k) => columns[k]);
  const candidates = [
    ...Object.entries(columns),
    ...others.map((col) => ["other", col]),
  ];

  const out = [];
  let current = null;

  const finish = () => {
    if (!current) return;
    out.push({
      sn: out.length + 1,
      date: current.date,
      time: null,
      description: current.parts.join(" ").replace(/\s+/g, " ").trim(),
      withdraw: current.amounts.withdraw ?? null,
      deposit: current.amounts.deposit ?? null,
      balance: current.amounts.balance ?? null,
      ambiguous: false,
    });
    current = null;
  };

  for (let r = header.index + header.span; r < rows.length; r++) {
    const row = rows[r];
    const text = row.cells.map((c) => c.text).join("  ");

    if (isHeaderLike(row)) continue;

    if (OPENING_ROW.test(text) || CLOSING_ROW.test(text)) {
      finish();
      const values = row.cells.map((c) => parseMoneyCell(c.text).value).filter((v) => v != null);
      const last = values[values.length - 1];
      if (last != null) {
        if (OPENING_ROW.test(text)) fields.openingBalance ??= last;
        else if (/closing|carried/i.test(text)) fields.closingBalance = last;
      }
      continue;
    }

    let date = null;
    const parts = [];
    const amounts = {};

    for (const cell of row.cells) {
      const column = nearestColumn(cell, candidates);
      const money = parseMoneyCell(cell.text);

      if (money.empty) continue;

      if (money.value != null) {
        if (amountKeys.includes(column)) amounts[column] = money.value;
        else if (column === "description") parts.push(cell.text);
        // Otherwise S.N, cheque or reference number — ignored.
        continue;
      }

      if (TIME_ONLY.test(cell.text)) continue;

      if (column !== "description") {
        const parsedDate = parseStatementDate(cell.text);
        if (parsedDate) {
          if (!date && column === "date") {
            date = parsedDate.date;
            // "2026-07-02 10:15 MB/ESEWA…" in one cell: keep what follows.
            const rest = cell.text
              .slice(parsedDate.end)
              .replace(/^\s*\d{1,2}:\d{2}(:\d{2})?(\s*[ap]m)?/i, "")
              .trim();
            if (rest) parts.push(rest);
          }
          continue;
        }
        if (column === "other") continue;
      }

      parts.push(cell.text);
    }

    if (date) {
      finish();
      current = { date, parts, amounts, page: row.page, y: row.y };
      continue;
    }

    // Continuation of a wrapped row: close by on the same page.
    if (current && row.page === current.page && row.y - current.y <= row.size * 2.6) {
      current.parts.push(...parts);
      for (const key of amountKeys) {
        if (current.amounts[key] == null && amounts[key] != null) current.amounts[key] = amounts[key];
      }
      current.y = row.y;
    } else {
      finish();
    }
  }
  finish();

  if (!columns.balance) {
    warnings.push("This statement has no balance column, so amounts can't be cross-checked.");
  }

  return { bank: id, ...fields, rows: out, warnings };
}
