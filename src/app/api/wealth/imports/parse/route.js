import { withRoute, json, badRequest, ApiError } from "@/lib/api";
import { requirePro } from "@/lib/entitlements";
import { log } from "@/lib/logger";
import { toMinorUnits } from "@/lib/money";
import { extractPdf, PdfReadError } from "@/features/wealth/imports/pdf-text";
import { csvToRows } from "@/features/wealth/imports/csv";
import { parseStatementLines, StatementError } from "@/features/wealth/imports/statement";
import { findAlreadyImported } from "@/features/wealth/imports/dedupe";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 5 * 1024 * 1024;

/** "%PDF-" — cheaper and more honest than trusting the file's MIME type. */
function looksLikePdf(bytes) {
  return (
    bytes.length > 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

function looksLikeCsv(file, bytes) {
  const name = String(file.name ?? "").toLowerCase();
  if (name.endsWith(".csv") || /csv|comma-separated/i.test(file.type ?? "")) return true;
  // No NUL bytes in the first chunk: plain text, worth trying as CSV.
  return bytes.length > 0 && !bytes.subarray(0, 1024).includes(0) && !looksLikePdf(bytes);
}

/**
 * POST /api/wealth/imports/parse — read a bank statement for preview. Pro only.
 *
 * multipart/form-data: file (PDF or CSV, ≤5 MB), password? (protected PDFs)
 *
 * Any bank works when its statement has Date, Description, Withdraw/Debit,
 * Deposit/Credit and Balance columns; Citizens Bank has a dedicated parser.
 *
 * → { bank, bankLabel, accountHolder, accountMasked, currency, fromDate, toDate,
 *     openingBalance, closingBalance, confidence, warnings,
 *     alreadyImportedCount, fullyImported,
 *     transactions: [{ date, description, direction, withdraw, deposit, balance,
 *                      suggestedCategory, fingerprint, alreadyImported }] }
 *
 * Nothing is saved and the file is never stored.
 */
export const POST = withRoute({ limit: "statementImport" }, async ({ userId, request }) => {
  await requirePro(userId, "Bank statement import is a Pro feature.");

  let form;
  try {
    form = await request.formData();
  } catch {
    throw badRequest("Expected a statement upload.");
  }

  const file = form.get("file");
  if (!file || typeof file === "string") throw badRequest("Choose a statement file to upload.");
  if (file.size > MAX_BYTES) throw badRequest("That file is larger than 5 MB.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const password = form.get("password");

  let result;
  try {
    let extracted;
    if (looksLikePdf(bytes)) {
      extracted = await extractPdf(bytes, {
        password: typeof password === "string" && password ? password : undefined,
      });
    } else if (looksLikeCsv(file, bytes)) {
      extracted = csvToRows(new TextDecoder("utf-8").decode(bytes));
    } else {
      throw badRequest("Upload your bank statement as a PDF or CSV file.");
    }
    result = parseStatementLines(extracted.lines, { rows: extracted.rows });
  } catch (err) {
    if (err instanceof PdfReadError || err instanceof StatementError) {
      throw new ApiError(422, err.message, err.code);
    }
    throw err;
  }

  // Flag rows this user already imported; the preview locks them out.
  const imported = await findAlreadyImported(
    userId,
    result.transactions.map((t) => ({
      fingerprint: t.fingerprint,
      date: t.date,
      direction: t.direction,
      paisa: toMinorUnits(t.withdraw ?? t.deposit),
      description: t.description,
    }))
  );
  const alreadyImportedCount = imported.filter(Boolean).length;

  // No account number, holder name or descriptions in the log line.
  log.info("Statement parsed", {
    userId,
    bank: result.bank,
    bankLabel: result.bankLabel,
    rows: result.transactions.length,
    alreadyImported: alreadyImportedCount,
    confidence: result.confidence,
  });

  return json({
    ...result,
    alreadyImportedCount,
    // Every row is already in the user's records: the same statement again.
    fullyImported: result.transactions.length > 0 && alreadyImportedCount === result.transactions.length,
    transactions: result.transactions.map((t, i) => ({ ...t, alreadyImported: imported[i] })),
  });
});
