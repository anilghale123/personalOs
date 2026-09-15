/**
 * PDF → text lines, rebuilt from glyph coordinates.
 *
 * Plain text extraction returns items in content-stream order, which for a
 * JasperReports table is often column by column — every S.N, then every
 * date. Statement parsing needs visual rows, so items are grouped by their
 * baseline and ordered along it. Wide gaps become a double space, which the
 * parsers use to separate header fields that share a row.
 *
 * Handles text drawn rotated 90° (landscape statements exported onto a
 * portrait page) by swapping the axes.
 *
 * Nothing is written to disk and the bytes are not retained: the caller
 * passes the upload's buffer and only the lines come back.
 */

import { getDocumentProxy } from "unpdf";

export class PdfReadError extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.name = "PdfReadError";
    this.code = code;
  }
}

/** Baseline distance (PDF units) within which items share a row. */
const ROW_TOLERANCE = 3;

/**
 * Group pdf.js text items into lines. Pure — exported for tests.
 * @param {Array<{str: string, transform: number[], width?: number}>} items
 * @returns {string[]}
 */
export function itemsToLines(items) {
  const text = (items || []).filter(
    (it) => typeof it?.str === "string" && it.str.trim() && Array.isArray(it.transform)
  );
  if (!text.length) return [];

  const rotatedCount = text.filter(
    (it) => Math.abs(it.transform[1]) > Math.abs(it.transform[0])
  ).length;
  const rotated = rotatedCount > text.length / 2;
  // +1: text advances up the page (rotated counter-clockwise); -1: down.
  const turn = rotated
    ? Math.sign(text.reduce((sum, it) => sum + it.transform[1], 0)) || 1
    : 1;

  // Position across rows, where smaller = nearer the reader's top.
  const rowPos = (it) => (rotated ? it.transform[4] * turn : -it.transform[5]);
  // Position along the row in reading direction.
  const colPos = (it) => (rotated ? it.transform[5] * turn : it.transform[4]);

  const sorted = [...text].sort((a, b) => rowPos(a) - rowPos(b));
  const rows = [];
  for (const it of sorted) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(rowPos(it) - last.anchor) <= ROW_TOLERANCE) last.items.push(it);
    else rows.push({ anchor: rowPos(it), items: [it] });
  }

  return rows
    .map(({ items: rowItems }) => {
      rowItems.sort((a, b) => colPos(a) - colPos(b));
      let line = "";
      let prevEnd = null;
      for (const it of rowItems) {
        const size = Math.hypot(it.transform[0], it.transform[1]) || 10;
        const start = colPos(it);
        if (prevEnd != null) {
          const gap = start - prevEnd;
          if (gap > size * 1.5) line = line.trimEnd() + "  ";
          else if (gap > size * 0.15 && !line.endsWith(" ") && !it.str.startsWith(" ")) line += " ";
        }
        line += it.str;
        prevEnd = start + (it.width || it.str.length * size * 0.5);
      }
      return line.replace(/[ \t]+$/, "");
    })
    .filter((line) => line.trim());
}

/**
 * @param {Uint8Array} bytes
 * @param {{password?: string, maxPages?: number}} [opts]
 * @returns {Promise<string[]>}
 */
export async function extractPdfLines(bytes, { password, maxPages = 60 } = {}) {
  let pdf;
  try {
    pdf = await getDocumentProxy(bytes, { password, isEvalSupported: false });
  } catch (err) {
    if (err?.name === "PasswordException") {
      // pdf.js: 1 = password needed, 2 = password incorrect.
      throw err.code === 2
        ? new PdfReadError("pdf_password_incorrect", "That PDF password is not correct.")
        : new PdfReadError(
            "pdf_password_required",
            "This statement is password-protected. Enter the PDF password your bank gave you."
          );
    }
    throw new PdfReadError(
      "pdf_unreadable",
      "Could not read this PDF. Make sure it is the electronic statement downloaded from your bank."
    );
  }

  try {
    const lines = [];
    const pages = Math.min(pdf.numPages, maxPages);
    for (let n = 1; n <= pages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      lines.push(...itemsToLines(content.items));
      page.cleanup?.();
    }
    return lines;
  } finally {
    await pdf.destroy?.();
  }
}
