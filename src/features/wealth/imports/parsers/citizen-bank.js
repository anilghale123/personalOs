/**
 * Citizens Bank International (CTZN) — "Electronic Account Statement" PDF.
 *
 * Input is the statement as text lines (see ../pdf-text.js, which rebuilds
 * visual rows from PDF coordinates). Output is bank-agnostic: header fields
 * plus one row per real transaction. Pure — no I/O — so it is unit tested
 * against fixture lines.
 *
 * Format contract (JasperReports export):
 *   header   Account Holder's Name, Account Number, From Date / To Date,
 *            Currency Code, Opening Balance / Closing Balance
 *   table    S.N | Transaction Date | Description | Withdraw | Deposit | Balance
 *   rows     "12  2026-07-02 10:15:22  MB/ESEWA/98.../Load  500.00  -  11,500.00"
 *            — descriptions wrap onto following lines; an empty side is "-";
 *            amounts use comma thousands.
 *   skipped  "Opening Balance" / "Closing Balance" rows (not transactions).
 */

export const id = "citizen-bank";
export const label = "Citizens Bank";

/** An amount cell, or "-" for an empty one. */
const AMOUNT_TOKEN = /^(?:-|-?\d{1,3}(?:,\d{3})*\.\d{2}|-?\d+\.\d{2})$/;
const ROW_START = /^\s*(\d{1,5})\s+(\d{4}-\d{2}-\d{2})(?:\s+(\d{1,2}:\d{2}(?::\d{2})?))?(?:\s+(.*))?$/;
const TIME_ONLY = /^\s*\d{1,2}:\d{2}(?::\d{2})?\s*$/;
const TABLE_HEADER = /S\.?\s*N\.?\b.*Transaction\s+Date.*Description/i;
/** Repeated page furniture that must not be glued onto a description. */
const NOISE = [
  /^Page\s+\d+(\s+of\s+\d+)?$/i,
  /Electronic Account Statement/i,
  /^(Withdraw|Deposit|Balance|Description|Transaction Date|S\.?\s*N\.?)(\s+(Withdraw|Deposit|Balance|Description|Transaction Date))*$/i,
  /^Printed (on|by|date)/i,
  /^\*+\s*(End of|This is a)/i,
  /system generated/i,
];

/**
 * Detect from header text. Two signals, both required, so an arbitrary PDF
 * that happens to say "account statement" is not claimed.
 * @param {string[]} lines
 */
export function detect(lines) {
  const head = lines.slice(0, 60).join("\n");
  return (
    /Electronic\s+Account\s+Statement/i.test(head) &&
    // pdf.js often yields a typographic ’ for the apostrophe.
    /Account\s+Holder['’]?s?\s+Name/i.test(head)
  );
}

/** "35,350.00" → 35350; "-" or junk → null. */
export function parseAmount(token) {
  if (token == null) return null;
  const t = String(token).trim();
  if (!t || t === "-") return null;
  const n = Number(t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Keep first 3 and last 4 digits: "0010100012345678" → "001•••••••••5678". */
export function maskAccount(acct) {
  if (!acct) return null;
  const s = String(acct).replace(/\s+/g, "");
  if (s.length <= 7) return `•••${s.slice(-4)}`;
  return `${s.slice(0, 3)}${"•".repeat(s.length - 7)}${s.slice(-4)}`;
}

function field(text, re) {
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

/**
 * Split trailing amount cells off a line. Takes at most `want` tokens, and a
 * lone trailing "-" only when it arrives with a real amount — a description
 * can legitimately end in a dash.
 * @returns {{text: string, amounts: string[]}}
 */
function splitTrailingAmounts(line, want) {
  const tokens = line.trim().split(/\s+/);
  const amounts = [];
  while (amounts.length < want && tokens.length && AMOUNT_TOKEN.test(tokens[tokens.length - 1])) {
    amounts.unshift(tokens.pop());
  }
  if (amounts.length && amounts.every((a) => a === "-")) {
    tokens.push(...amounts);
    return { text: tokens.join(" "), amounts: [] };
  }
  return { text: tokens.join(" "), amounts };
}

/**
 * @param {string[]} lines
 * @returns {{
 *   bank: string, accountHolder: string|null, accountMasked: string|null,
 *   currency: string, fromDate: string|null, toDate: string|null,
 *   openingBalance: number|null, closingBalance: number|null,
 *   rows: Array<{sn: number, date: string, time: string|null, description: string,
 *                withdraw: number|null, deposit: number|null, balance: number|null}>,
 *   warnings: string[]
 * }}
 */
export function parse(lines) {
  const text = lines.join("\n");
  const warnings = [];

  const header = {
    accountHolder: field(text, /Account\s+Holder['’]?s?\s+Name\s*:?\s*(.+?)(?:\s{2,}|\n|$)/i),
    accountNumber: field(text, /Account\s+(?:Number|No\.?)\s*:?\s*([0-9][0-9A-Z-]{5,})/i),
    fromDate: field(text, /From\s+Date\s*:?\s*(\d{4}-\d{2}-\d{2})/i),
    toDate: field(text, /To\s+Date\s*:?\s*(\d{4}-\d{2}-\d{2})/i),
    currency: field(text, /Currency(?:\s+Code)?\s*:?\s*([A-Z]{3})\b/) || "NPR",
    openingBalance: parseAmount(field(text, /Opening\s+Balance\s*:?\s*(-?[\d,]+\.\d{2})/i)),
    closingBalance: parseAmount(field(text, /Closing\s+Balance\s*:?\s*(-?[\d,]+\.\d{2})/i)),
  };

  const rows = [];
  let current = null;
  let inTable = false;
  let done = false;

  const finish = () => {
    if (!current) return;
    const [withdraw, deposit, balance] =
      current.amounts.length === 3
        ? current.amounts.map(parseAmount)
        : current.amounts.length === 2
        ? // Two cells: the empty side was dropped by extraction — the last
          // is always the balance; direction is resolved from it later.
          [parseAmount(current.amounts[0]), null, parseAmount(current.amounts[1])]
        : [null, null, parseAmount(current.amounts[0])];
    rows.push({
      sn: current.sn,
      date: current.date,
      time: current.time,
      description: current.parts.join(" ").replace(/\s+/g, " ").trim(),
      withdraw,
      deposit,
      balance,
      ambiguous: current.amounts.length === 2,
    });
    current = null;
  };

  for (const rawLine of lines) {
    if (done) break;
    const line = rawLine.replace(/\s+$/, "");
    if (!line.trim()) continue;

    if (TABLE_HEADER.test(line)) {
      finish();
      inTable = true;
      continue;
    }
    if (!inTable) continue;

    if (/Closing\s+Balance/i.test(line)) {
      finish();
      const closing = splitTrailingAmounts(line, 3).amounts.map(parseAmount).filter((n) => n != null);
      if (closing.length && header.closingBalance == null) header.closingBalance = closing[closing.length - 1];
      done = true;
      continue;
    }
    if (/Opening\s+Balance/i.test(line)) {
      finish();
      const opening = splitTrailingAmounts(line, 3).amounts.map(parseAmount).filter((n) => n != null);
      if (opening.length && header.openingBalance == null) header.openingBalance = opening[opening.length - 1];
      continue;
    }
    if (NOISE.some((re) => re.test(line.trim()))) continue;

    const start = line.match(ROW_START);
    if (start) {
      finish();
      const [, sn, date, time, rest = ""] = start;
      const { text: desc, amounts } = splitTrailingAmounts(rest, 3);
      current = { sn: Number(sn), date, time: time ?? null, parts: desc ? [desc] : [], amounts };
      continue;
    }

    if (!current) continue;

    if (TIME_ONLY.test(line)) {
      current.time ??= line.trim();
      continue;
    }

    // Continuation: more description, and possibly the amount cells when
    // extraction put them on a wrapped line.
    const need = 3 - current.amounts.length;
    const { text: more, amounts } = need > 0 ? splitTrailingAmounts(line, need) : { text: line.trim(), amounts: [] };
    if (more) current.parts.push(more);
    if (amounts.length) current.amounts.push(...amounts);
  }
  finish();

  if (!inTable) warnings.push("Could not find the transaction table header.");

  return {
    bank: id,
    accountHolder: header.accountHolder,
    accountMasked: maskAccount(header.accountNumber),
    currency: header.currency,
    fromDate: header.fromDate,
    toDate: header.toDate,
    openingBalance: header.openingBalance,
    closingBalance: header.closingBalance,
    rows,
    warnings,
  };
}
