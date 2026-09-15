import { withRoute, json, badRequest, ApiError } from "@/lib/api";
import { requirePro } from "@/lib/entitlements";
import { log } from "@/lib/logger";
import { extractPdfLines, PdfReadError } from "@/features/wealth/imports/pdf-text";
import { parseStatementLines, StatementError } from "@/features/wealth/imports/statement";
import { findAlreadyImported } from "@/features/wealth/imports/dedupe";
import { toMinorUnits } from "@/lib/money";

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

/**
 * POST /api/wealth/imports/parse — read a bank statement for preview. Pro only.
 *
 * multipart/form-data: file (PDF, ≤5 MB), password? (for protected PDFs)
 *
 * → { bank, bankLabel, accountHolder, accountMasked, currency, fromDate, toDate,
 *     openingBalance, closingBalance, confidence, warnings,
 *     transactions: [{ date, description, direction, withdraw, deposit, balance,
 *                      suggestedCategory, fingerprint, alreadyImported }] }
 *
 * Nothing is saved here and the file is never stored — it is read from the
 * request, turned into rows, and dropped. Saving is a separate `commit` call
 * after the user reviews the preview.
 */
export const POST = withRoute({ limit: "statementImport" }, async ({ userId, request }) => {
  await requirePro(userId, "Bank statement import is a Pro feature.");

  let form;
  try {
    form = await request.formData();
  } catch {
    throw badRequest("Expected a PDF upload.");
  }

  const file = form.get("file");
  if (!file || typeof file === "string") throw badRequest("Choose a PDF statement to upload.");
  if (file.size > MAX_BYTES) throw badRequest("That file is larger than 5 MB.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!looksLikePdf(bytes)) {
    throw badRequest("That doesn't look like a PDF. Upload the electronic statement PDF from your bank.");
  }

  const password = form.get("password");

  let result;
  try {
    const lines = await extractPdfLines(bytes, {
      password: typeof password === "string" && password ? password : undefined,
    });
    result = parseStatementLines(lines);
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
