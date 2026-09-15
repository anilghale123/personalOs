import { describe, expect, it } from "vitest";
import { bsToAd } from "@/lib/nepali-date";
import { itemsToRows, rowsToLines } from "../pdf-text";
import { csvToRows } from "../csv";
import { parseStatementLines } from "../statement";
import { detect, parseMoneyCell } from "./generic-table";

/** A pdf.js-like text item at (x, y), font size 8. */
const at = (str, x, y) => ({ str, transform: [8, 0, 0, 8, x, y], width: str.length * 4 });

function statement(pages) {
  const rows = pages.flatMap((items, i) => itemsToRows(items, i + 1));
  return parseStatementLines(rowsToLines(rows), { rows });
}

describe("parseMoneyCell", () => {
  it.each([
    ["5,000.00", 5000],
    ["5000", 5000],
    ["Rs. 500", 500],
    ["(1,200.00)", 1200],
    ["1,200.00 Dr", 1200],
    ["1,00,000.00", 100000],
  ])("%s → %d", (text, value) => {
    expect(parseMoneyCell(text)).toEqual({ value, empty: false });
  });

  it("treats dashes and blanks as empty cells", () => {
    expect(parseMoneyCell("-").empty).toBe(true);
    expect(parseMoneyCell("").empty).toBe(true);
  });

  it("rejects text and dates", () => {
    expect(parseMoneyCell("REF1").value).toBeNull();
    expect(parseMoneyCell("02/07/2026").value).toBeNull();
    expect(parseMoneyCell("1,2").value).toBeNull();
  });
});

describe("generic PDF statement — Debit/Credit layout with blank cells", () => {
  // Column order and names differ from Citizens: S.N, Txn Date, Particulars,
  // Cheque No, Debit, Credit, Balance. Each row leaves one amount cell blank.
  const page = [
    at("Nabil Bank Limited", 40, 800),
    at("Account Name : TEST USER", 40, 785),
    at("Account No : 01234567890123", 300, 785),
    at("Statement From : 01/07/2026", 40, 770),
    at("To : 31/07/2026", 300, 770),

    at("S.N", 40, 740),
    at("Txn Date", 70, 740),
    at("Particulars", 130, 740),
    at("Cheque No", 300, 740),
    at("Debit", 380, 740),
    at("Credit", 440, 740),
    at("Balance", 510, 740),

    at("Opening Balance", 130, 725),
    at("12,000.00", 505, 725),

    at("1", 40, 710),
    at("02/07/2026", 70, 710),
    at("ESEWA LOAD 9801234567", 130, 710),
    at("500.00", 375, 710),
    at("11,500.00", 500, 710),

    at("2", 40, 695),
    at("05/07/2026", 70, 695),
    at("SALARY FOR JULY", 130, 695),
    at("35,350.00", 432, 695),
    at("46,850.00", 500, 695),

    at("3", 40, 680),
    at("06/07/2026", 70, 680),
    at("FT TO RAM", 130, 680),
    at("000123", 300, 680),
    at("5,000.00", 375, 680),
    at("41,850.00", 500, 680),
    at("BAHADUR", 130, 670),

    at("Total", 130, 650),
    at("5,500.00", 375, 650),
    at("35,350.00", 432, 650),
    at("Closing Balance", 130, 635),
    at("41,850.00", 500, 635),

    at("This is a system generated statement.", 40, 500),
  ];
  const result = statement([page]);

  it("detects the table and the bank", () => {
    const rows = itemsToRows(page);
    expect(detect(rowsToLines(rows), { rows })).toBe(true);
    expect(result).toMatchObject({
      bank: "generic",
      bankLabel: "Nabil Bank",
      accountHolder: "TEST USER",
      accountMasked: "012•••••••0123",
      fromDate: "2026-07-01",
      toDate: "2026-07-31",
      openingBalance: 12000,
      closingBalance: 41850,
    });
  });

  it("places amounts under the right column even when a cell is blank", () => {
    expect(result.transactions.map((t) => [t.date, t.direction, t.withdraw ?? t.deposit, t.balance])).toEqual([
      ["2026-07-02", "withdraw", 500, 11500],
      ["2026-07-05", "deposit", 35350, 46850],
      ["2026-07-06", "withdraw", 5000, 41850],
    ]);
  });

  it("ignores serial and cheque numbers, skips totals and footers, joins wrapped text", () => {
    expect(result.transactions.map((t) => t.description)).toEqual([
      "ESEWA LOAD 9801234567",
      "SALARY FOR JULY",
      "FT TO RAM BAHADUR",
    ]);
  });

  it("cross-checks cleanly against the running balance", () => {
    expect(result.warnings).toEqual([]);
    expect(result.confidence).toBe("high");
  });
});

describe("generic PDF statement — wrapped header, BS dates, multiple pages", () => {
  const page1 = [
    at("Global IME Bank Ltd.", 40, 800),
    at("Transaction", 60, 760),
    at("Description", 150, 760),
    at("Withdrawal", 300, 760),
    at("Deposit", 380, 760),
    at("Balance", 460, 760),
    at("Miti", 60, 752),

    at("2083-03-18", 60, 735),
    at("Cash Deposit", 150, 735),
    at("20,000.00", 390, 735),
    at("20,000.00", 455, 735),

    at("2083-03-20", 60, 720),
    at("Khalti load", 150, 720),
    at("1,000.00", 305, 720),
    at("19,000.00", 455, 720),
  ];
  const page2 = [
    at("Transaction Miti", 60, 800),
    at("Description", 150, 800),
    at("Withdrawal", 300, 800),
    at("Deposit", 380, 800),
    at("Balance", 460, 800),

    at("2083-03-25", 60, 780),
    at("NEA bill", 150, 780),
    at("2,500.00", 305, 780),
    at("16,500.00", 455, 780),
  ];
  const result = statement([page1, page2]);

  it("reads all pages and skips the repeated header", () => {
    expect(result.bankLabel).toBe("Global IME Bank");
    expect(result.transactions).toHaveLength(3);
  });

  it("converts Bikram Sambat dates to AD", () => {
    expect(result.transactions.map((t) => t.date)).toEqual([
      bsToAd(2083, 2, 18),
      bsToAd(2083, 2, 20),
      bsToAd(2083, 2, 25),
    ]);
  });

  it("assigns directions and suggests categories", () => {
    expect(result.transactions.map((t) => [t.direction, t.suggestedCategory])).toEqual([
      ["deposit", "Other"],
      ["withdraw", "Transfers"],
      ["withdraw", "Utilities"],
    ]);
  });

  it("derives the period from the rows when the statement doesn't print one", () => {
    expect(result.fromDate).toBe(bsToAd(2083, 2, 18));
    expect(result.toDate).toBe(bsToAd(2083, 2, 25));
  });
});

describe("CSV statements", () => {
  const csv = [
    "Statement of Account",
    "Date,Description,Ref No,Withdraw,Deposit,Balance",
    "02-Jul-2026,ESEWA TOPUP,REF1,500.00,,11500.00",
    '05-Jul-2026,"SALARY, JULY",REF2,,35350.00,46850.00',
  ].join("\n");

  it("parses through the same generic table parser", () => {
    const { lines, rows } = csvToRows(csv);
    const result = parseStatementLines(lines, { rows });
    expect(result.bank).toBe("generic");
    expect(result.transactions.map((t) => [t.date, t.description, t.direction, t.withdraw ?? t.deposit])).toEqual([
      ["2026-07-02", "ESEWA TOPUP", "withdraw", 500],
      ["2026-07-05", "SALARY, JULY", "deposit", 35350],
    ]);
  });
});

describe("unsupported files", () => {
  it("rejects a document with no statement table", () => {
    const rows = itemsToRows([at("Invoice #42", 40, 800), at("Total 500.00", 40, 780)]);
    try {
      parseStatementLines(rowsToLines(rows), { rows });
      throw new Error("expected a throw");
    } catch (err) {
      expect(err.code).toBe("unsupported_statement");
    }
  });
});
