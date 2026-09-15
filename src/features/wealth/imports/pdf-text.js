/**
 * PDF → visual rows of positioned cells (and plain text lines).
 *
 * Plain text extraction returns items in content-stream order, which for a
 * report-generated table is often column by column — every S.N, then every
 * date. Statement parsing needs visual rows, so items are grouped by their
 * baseline and ordered along it. Items separated by a wide gap become
 * separate **cells**, each keeping its horizontal extent, so a parser can
 * place a value under the right column header even when neighbouring cells
 * are blank — the thing that makes a bank-agnostic parser possible.
 *
 * Handles text drawn rotated 90° (landscape statements on a portrait page)
 * by swapping the axes.
 *
 * Nothing is written to disk and the bytes are not retained.
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
 * @typedef {{text: string, start: number, end: number}} Cell
 * @typedef {{page: number, y: number, size: number, cells: Cell[]}} Row
 */

/**
 * Group pdf.js text items into rows of cells. Pure — exported for tests.
 * @param {Array<{str: string, transform: number[], width?: number}>} items
 * @param {number} [page]
 * @returns {Row[]}
 */
export function itemsToRows(items, page = 1) {
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
  const groups = [];
  for (const it of sorted) {
    const last = groups[groups.length - 1];
    if (last && Math.abs(rowPos(it) - last.anchor) <= ROW_TOLERANCE) last.items.push(it);
    else groups.push({ anchor: rowPos(it), items: [it] });
  }

  return groups.map(({ anchor, items: rowItems }) => {
    rowItems.sort((a, b) => colPos(a) - colPos(b));
    const cells = [];
    let size = 10;
    for (const it of rowItems) {
      size = Math.hypot(it.transform[0], it.transform[1]) || 10;
      const start = colPos(it);
      const end = start + (it.width || it.str.length * size * 0.5);
      const cell = cells[cells.length - 1];
      const gap = cell ? start - cell.end : Infinity;

      if (cell && gap <= size * 1.5) {
        const joiner = gap > size * 0.15 && !cell.text.endsWith(" ") && !it.str.startsWith(" ") ? " " : "";
        cell.text += joiner + it.str;
        cell.end = Math.max(cell.end, end);
      } else {
        cells.push({ text: it.str, start, end });
      }
    }
    for (const cell of cells) cell.text = cell.text.trim();
    return { page, y: anchor, size, cells: cells.filter((c) => c.text) };
  }).filter((row) => row.cells.length);
}

/** Rows → text lines, cells separated by a double space. */
export function rowsToLines(rows) {
  return rows.map((row) => row.cells.map((c) => c.text).join("  "));
}

/**
 * Group pdf.js text items into lines. Pure — exported for tests.
 * @returns {string[]}
 */
export function itemsToLines(items) {
  return rowsToLines(itemsToRows(items));
}

/**
 * @param {Uint8Array} bytes
 * @param {{password?: string, maxPages?: number}} [opts]
 * @returns {Promise<{lines: string[], rows: Row[]}>}
 */
export async function extractPdf(bytes, { password, maxPages = 60 } = {}) {
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
    const rows = [];
    const pages = Math.min(pdf.numPages, maxPages);
    for (let n = 1; n <= pages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      rows.push(...itemsToRows(content.items, n));
      page.cleanup?.();
    }
    return { lines: rowsToLines(rows), rows };
  } finally {
    await pdf.destroy?.();
  }
}

/** Text lines only — kept for callers that don't need positions. */
export async function extractPdfLines(bytes, opts) {
  return (await extractPdf(bytes, opts)).lines;
}
