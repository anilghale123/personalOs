import { describe, expect, it } from "vitest";
import { parseStatementLines, StatementError, normalizeDescription } from "./statement";
import { detect, maskAccount, parseAmount } from "./parsers/citizen-bank";
import { detectParser } from "./parsers";

/**
 * Fixture lines shaped like pdf-text.js output for a Citizens Bank
 * "Electronic Account Statement": header fields sharing rows (separated by
 * wide gaps), wrapped descriptions, "-" for empty cells, comma thousands,
 * repeated page furniture, and opening/closing balance rows.
 */
const CITIZEN = [
  "Citizens Bank International Limited",
  "Electronic Account Statement",
  "Account Holder's Name : ANIL GHALE      Account Number : 0010100012345678",
  "From Date : 2026-07-01      To Date : 2026-07-31",
  "Currency Code : NPR      Account Interest Rate : 3.50",
  "Opening Balance : 12,000.00      Closing Balance : 41,650.00",
  "Accrued Interest : 12.34",
  "S.N  Transaction Date  Description  Withdraw  Deposit  Balance",
  "Opening Balance  12,000.00",
  "1  2026-07-02 10:15:22  MB/ESEWA/9801234567/Load  500.00  -  11,500.00",
  "wallet load ref 12345",
  "2  2026-07-03 08:01:00  NT Prepaid topup 9841000000  100.00  -  11,400.00",
  "3  2026-07-05 12:00:00  SALARY FOR JULY 2026  -  35,350.00  46,750.00",
  "Page 1 of 2",
  "Electronic Account Statement",
  "S.N  Transaction Date  Description  Withdraw  Deposit  Balance",
  "4  2026-07-06 09:30:00  FT to 00101000999 RAM  5,000.00  -  41,750.00",
  "BAHADUR",
  "5  2026-07-07 09:30:00  NT Prepaid topup 9841000000  100.00  -  41,650.00",
  "Closing Balance  41,650.00",
  "Page 2 of 2",
];

describe("citizen-bank detection", () => {
  it("claims a Citizens electronic statement", () => {
    expect(detect(CITIZEN)).toBe(true);
    expect(detectParser(CITIZEN)?.id).toBe("citizen-bank");
  });

  it("accepts the typographic apostrophe pdf.js produces", () => {
    // Seen in real extraction: "Account Holder’s Name".
    const curly = CITIZEN.map((l) => l.replace("Holder's", "Holder’s"));
    expect(detect(curly)).toBe(true);
    expect(parseStatementLines(curly).accountHolder).toBe("ANIL GHALE");
  });

  it("does not claim an unrelated PDF", () => {
    expect(detect(["Invoice", "Account statement", "Total 500.00"])).toBe(false);
  });
});

describe("helpers", () => {
  it("parses comma amounts and dashes", () => {
    expect(parseAmount("35,350.00")).toBe(35350);
    expect(parseAmount("5,000.00")).toBe(5000);
    expect(parseAmount("-")).toBeNull();
  });

  it("masks the middle of an account number", () => {
    expect(maskAccount("0010100012345678")).toBe("001•••••••••5678");
    expect(maskAccount("0010100012345678")).not.toContain("01000123");
  });

  it("normalises descriptions for fingerprinting", () => {
    expect(normalizeDescription("MB/ESEWA/98012  Load")).toBe("mb esewa 98012 load");
  });
});

describe("parseStatementLines — Citizens sample", () => {
  const result = parseStatementLines(CITIZEN);

  it("reads the header", () => {
    expect(result).toMatchObject({
      bank: "citizen-bank",
      accountHolder: "ANIL GHALE",
      accountMasked: "001•••••••••5678",
      currency: "NPR",
      fromDate: "2026-07-01",
      toDate: "2026-07-31",
      openingBalance: 12000,
      closingBalance: 41650,
    });
  });

  it("never exposes the full account number", () => {
    expect(JSON.stringify(result)).not.toContain("0010100012345678");
  });

  it("skips opening/closing rows and page furniture", () => {
    expect(result.transactions).toHaveLength(5);
    expect(result.transactions.some((t) => /balance|page/i.test(t.description))).toBe(false);
  });

  it("assigns withdraw and deposit columns correctly", () => {
    const [load, topup, salary, ft] = result.transactions;
    expect(load).toMatchObject({ direction: "withdraw", withdraw: 500, deposit: null, balance: 11500 });
    expect(topup).toMatchObject({ direction: "withdraw", withdraw: 100 });
    expect(salary).toMatchObject({ direction: "deposit", withdraw: null, deposit: 35350, balance: 46750 });
    expect(ft).toMatchObject({ direction: "withdraw", withdraw: 5000 });
  });

  it("joins wrapped description lines", () => {
    expect(result.transactions[0].description).toBe("MB/ESEWA/9801234567/Load wallet load ref 12345");
    expect(result.transactions[3].description).toBe("FT to 00101000999 RAM BAHADUR");
  });

  it("suggests categories", () => {
    expect(result.transactions.map((t) => t.suggestedCategory)).toEqual([
      "Transfers",
      "Internet & Phone",
      "Salary",
      "Transfers",
      "Internet & Phone",
    ]);
  });

  it("validates cleanly against the running balance", () => {
    expect(result.warnings).toEqual([]);
    expect(result.confidence).toBe("high");
  });

  it("gives identical rows distinct fingerprints that are stable on re-import", () => {
    const fps = result.transactions.map((t) => t.fingerprint);
    expect(new Set(fps).size).toBe(5);
    expect(parseStatementLines(CITIZEN).transactions.map((t) => t.fingerprint)).toEqual(fps);
    fps.forEach((fp) => expect(fp).toMatch(/^[a-f0-9]{40}$/));
  });

  it("fingerprints a transaction the same way in an overlapping statement", () => {
    // A later statement starting mid-month still contains row 4.
    const overlapping = [
      ...CITIZEN.slice(0, 8),
      "Opening Balance  46,750.00",
      "1  2026-07-06 09:30:00  FT to 00101000999 RAM  5,000.00  -  41,750.00",
      "BAHADUR",
      "Closing Balance  41,750.00",
    ];
    const again = parseStatementLines(overlapping).transactions[0];
    expect(again.fingerprint).toBe(result.transactions[3].fingerprint);
  });
});

describe("parseStatementLines — extraction variants", () => {
  const header = CITIZEN.slice(0, 8);

  it("handles the time and the amounts landing on wrapped lines", () => {
    const lines = [
      ...header,
      "Opening Balance  12,000.00",
      "1  2026-07-02  MB/ESEWA/9801234567/",
      "10:15:22",
      "Load  500.00  -  11,500.00",
      "Closing Balance  11,500.00",
    ];
    const [t] = parseStatementLines(lines).transactions;
    expect(t).toMatchObject({ direction: "withdraw", withdraw: 500, balance: 11500 });
    expect(t.description).toBe("MB/ESEWA/9801234567/ Load");
  });

  it("resolves direction from the balance when the empty '-' cell was dropped", () => {
    const lines = [
      ...header,
      "Opening Balance  12,000.00",
      "1  2026-07-05 12:00:00  SALARY FOR JULY  35,350.00  47,350.00",
      "2  2026-07-06 12:00:00  FT to 001 RAM  350.00  47,000.00",
      "Closing Balance  47,000.00",
    ];
    const [salary, ft] = parseStatementLines(lines).transactions;
    expect(salary).toMatchObject({ direction: "deposit", deposit: 35350 });
    expect(ft).toMatchObject({ direction: "withdraw", withdraw: 350 });
  });

  it("warns and lowers confidence when balances don't add up", () => {
    const lines = [
      ...header,
      "Opening Balance  12,000.00",
      "1  2026-07-02 10:15:22  ESEWA  500.00  -  9,000.00",
      "2  2026-07-03 10:15:22  ESEWA  500.00  -  1,000.00",
      "Closing Balance  1,000.00",
    ];
    const result = parseStatementLines(lines);
    expect(result.confidence).toBe("low");
    expect(result.warnings.join(" ")).toMatch(/running balance/);
  });
});

describe("parseStatementLines — errors", () => {
  it("reports an unreadable (image-only) PDF", () => {
    expect(() => parseStatementLines([])).toThrow(StatementError);
    try {
      parseStatementLines([" "]);
    } catch (err) {
      expect(err.code).toBe("pdf_no_text");
    }
  });

  it("reports an unsupported bank", () => {
    try {
      parseStatementLines(["Some Other Bank", "Monthly statement for your account", "Total 1,000.00"]);
      throw new Error("expected a throw");
    } catch (err) {
      expect(err.code).toBe("unsupported_statement");
    }
  });
});
