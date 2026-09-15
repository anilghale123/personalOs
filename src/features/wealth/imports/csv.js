/**
 * CSV statement exports → the same positioned rows the PDF extractor makes.
 *
 * Each column index becomes a fixed horizontal slot, so the generic table
 * parser places CSV cells under their headers exactly as it does for a PDF —
 * one parsing path for both formats.
 */

import Papa from "papaparse";
import { rowsToLines } from "./pdf-text";

const SLOT = 100;

/**
 * @param {string} text
 * @returns {{lines: string[], rows: Array}}
 */
export function csvToRows(text) {
  const { data } = Papa.parse(String(text ?? "").replace(/^﻿/, ""), {
    skipEmptyLines: "greedy",
  });

  const rows = data
    .map((columns, i) => ({
      page: 1,
      y: i * 10,
      size: 10,
      cells: (Array.isArray(columns) ? columns : [])
        .map((value, j) => ({ text: String(value ?? "").trim(), start: j * SLOT, end: j * SLOT + SLOT * 0.9 }))
        .filter((cell) => cell.text),
    }))
    .filter((row) => row.cells.length);

  return { lines: rowsToLines(rows), rows };
}
