import { describe, expect, it } from "vitest";
import { itemsToLines } from "./pdf-text";

/** A pdf.js-like text item: upright text at (x, y), font size 10. */
const at = (str, x, y, width = str.length * 5) => ({ str, transform: [10, 0, 0, 10, x, y], width });
/** Text rotated 90° counter-clockwise: advances up the page. */
const ccw = (str, x, y, width = str.length * 5) => ({ str, transform: [0, 10, -10, 0, x, y], width });

describe("itemsToLines", () => {
  it("rebuilds visual rows from column-ordered items, top to bottom", () => {
    // Content-stream order: one column at a time.
    const items = [
      at("1", 20, 700),
      at("2", 20, 680),
      at("2026-07-02", 60, 700),
      at("2026-07-03", 60, 680),
      at("500.00", 300, 700),
      at("100.00", 300, 681.5), // slightly off baseline, same row
    ];
    expect(itemsToLines(items)).toEqual([
      "1  2026-07-02  500.00",
      "2  2026-07-03  100.00",
    ]);
  });

  it("uses a single space for adjacent words and a double space for column gaps", () => {
    const items = [
      at("Account", 20, 700, 35),
      at("Number", 58, 700, 30),
      at(":", 90, 700, 3),
      at("001", 96, 700, 15),
      at("From", 300, 700, 20),
    ];
    expect(itemsToLines(items)).toEqual(["Account Number : 001  From"]);
  });

  it("reads text rotated 90° as rows across the x axis", () => {
    const items = [
      ccw("second", 120, 50),
      ccw("first", 100, 50),
      ccw("row", 100, 200),
    ];
    expect(itemsToLines(items)).toEqual(["first  row", "second"]);
  });

  it("ignores empty items and returns nothing for an image-only page", () => {
    expect(itemsToLines([at("  ", 1, 1), { str: "x" }])).toEqual([]);
    expect(itemsToLines([])).toEqual([]);
  });
});
