import { describe, expect, it } from "vitest";
import {
  amountMajor,
  blankAsAbsent,
  clearableDateKey,
  dateKey,
  optionalRate,
  email,
  finiteNumber,
  formatZodError,
  idempotencyKey,
  objectId,
  optionalDateKey,
  optionalObjectId,
  optionalText,
  pagination,
  password,
  positiveNumber,
  queryObject,
  tagList,
  text,
  MAX_AMOUNT_PAISA,
  z,
} from "./validation";

/** Shorthand: parse and return either the value or the thrown error. */
const ok = (schema, input) => schema.parse(input);
const fails = (schema, input) => !schema.safeParse(input).success;

describe("amountMajor", () => {
  it("converts rupees to integer paisa", () => {
    expect(ok(amountMajor, 450.5)).toBe(45050);
    expect(ok(amountMajor, "450.50")).toBe(45050);
    expect(ok(amountMajor, 1)).toBe(100);
  });

  it("rounds to the nearest paisa rather than truncating", () => {
    expect(ok(amountMajor, 0.005)).toBe(1);
    expect(ok(amountMajor, 10.994)).toBe(1099);
  });

  it("rejects the values that used to reach the database", () => {
    expect(fails(amountMajor, NaN)).toBe(true);
    expect(fails(amountMajor, Infinity)).toBe(true);
    expect(fails(amountMajor, -5)).toBe(true);
    expect(fails(amountMajor, 0)).toBe(true);
    expect(fails(amountMajor, "not a number")).toBe(true);
    expect(fails(amountMajor, "")).toBe(true);
    expect(fails(amountMajor, null)).toBe(true);
    expect(fails(amountMajor, undefined)).toBe(true);
    expect(fails(amountMajor, {})).toBe(true);
  });

  it("rejects an amount past the safe ceiling", () => {
    expect(fails(amountMajor, 1e30)).toBe(true);
    expect(fails(amountMajor, MAX_AMOUNT_PAISA)).toBe(true);
  });

  it("never yields a non-integer", () => {
    for (const v of [0.01, 1.005, 99.999, 12345.678]) {
      expect(Number.isInteger(ok(amountMajor, v))).toBe(true);
    }
  });
});

describe("positiveNumber / finiteNumber", () => {
  it("rejects NaN, the bug that poisoned unitsPurchased", () => {
    expect(fails(positiveNumber(), NaN)).toBe(true);
    expect(fails(positiveNumber(), "abc")).toBe(true);
    expect(fails(positiveNumber(), Infinity)).toBe(true);
    expect(fails(positiveNumber(), 0)).toBe(true);
    expect(fails(positiveNumber(), -1)).toBe(true);
  });

  it("accepts real quantities and coerces numeric strings", () => {
    expect(ok(positiveNumber(), 12.5)).toBe(12.5);
    expect(ok(positiveNumber(), "12.5")).toBe(12.5);
  });

  it("honours an explicit maximum", () => {
    expect(fails(positiveNumber(100), 101)).toBe(true);
    expect(ok(positiveNumber(100), 100)).toBe(100);
  });

  it("finiteNumber allows zero and negatives inside range", () => {
    expect(ok(finiteNumber(), 0)).toBe(0);
    expect(ok(finiteNumber(), -4.5)).toBe(-4.5);
    expect(fails(finiteNumber(0, 10), -1)).toBe(true);
    expect(fails(finiteNumber(), NaN)).toBe(true);
  });
});

describe("dateKey", () => {
  it("accepts a well-formed local date key", () => {
    expect(ok(dateKey, "2026-03-05")).toBe("2026-03-05");
  });

  it("rejects malformed and impossible dates", () => {
    expect(fails(dateKey, "2026-3-5")).toBe(true);
    expect(fails(dateKey, "05-03-2026")).toBe(true);
    expect(fails(dateKey, "2026-13-01")).toBe(true);
    expect(fails(dateKey, "not-a-date")).toBe(true);
    expect(fails(dateKey, "")).toBe(true);
  });
});

describe("objectId", () => {
  it("accepts a 24-char hex id and rejects anything else", () => {
    expect(ok(objectId, "507f1f77bcf86cd799439011")).toBeTruthy();
    // The CastError-500 case: a junk path segment.
    expect(fails(objectId, "not-an-id")).toBe(true);
    expect(fails(objectId, "507f1f77bcf86cd79943901")).toBe(true);
    expect(fails(objectId, "")).toBe(true);
  });
});

describe("text / optionalText / tagList", () => {
  it("trims and enforces a ceiling", () => {
    expect(ok(text(10), "  hi  ")).toBe("hi");
    expect(fails(text(5), "far too long")).toBe(true);
  });

  it("optionalText accepts an OMITTED key, not just an explicit undefined", () => {
    /**
     * The regression this pins: in zod 4 a union containing `z.undefined()`
     * still rejects a missing key, so every route with an optional note field
     * refused any request that simply left the note out — which is the normal
     * case, not the edge case.
     */
    const schema = z.object({ note: optionalText(50) });
    expect(schema.safeParse({}).success).toBe(true);
    expect(schema.safeParse({ note: undefined }).success).toBe(true);
    expect(schema.safeParse({ note: null }).success).toBe(true);
    expect(schema.safeParse({ note: "hi" }).data.note).toBe("hi");
  });

  it("every optional primitive tolerates an omitted key", () => {
    // One assertion per primitive that a route may mark optional, because
    // each is built differently and only some needed `.optional()`.
    const schema = z.object({
      note: optionalText(50),
      when: optionalDateKey,
      who: optionalObjectId,
      rate: optionalRate,
      tags: tagList.optional(),
      amount: amountMajor.optional(),
    });
    const result = schema.safeParse({});
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  });

  it("optionalText turns blanks into undefined", () => {
    expect(ok(optionalText(10), "")).toBeUndefined();
    expect(ok(optionalText(10), "   ")).toBeUndefined();
    expect(ok(optionalText(10), null)).toBeUndefined();
    expect(ok(optionalText(10), undefined)).toBeUndefined();
    expect(ok(optionalText(10), " note ")).toBe("note");
  });

  it("tagList dedupes, trims and drops blanks", () => {
    expect(ok(tagList, [" food ", "food", "", "  ", "travel"])).toEqual([
      "food",
      "travel",
    ]);
  });
});

describe("email / password", () => {
  it("normalises email to lowercase", () => {
    expect(ok(email, "  Nitisha@Example.COM ")).toBe("nitisha@example.com");
  });

  it("rejects a non-email, which signup used to accept", () => {
    expect(fails(email, "notanemail")).toBe(true);
    expect(fails(email, "a@")).toBe(true);
    expect(fails(email, "")).toBe(true);
  });

  it("enforces a ten-character password floor", () => {
    expect(fails(password, "short")).toBe(true);
    expect(fails(password, "123456")).toBe(true); // the old minimum
    expect(ok(password, "a-real-passphrase")).toBeTruthy();
  });
});

describe("idempotencyKey", () => {
  it("accepts a uuid-shaped key and rejects junk", () => {
    expect(ok(idempotencyKey, "7f3a9c21-4b0e-4a11-9f2d-6c8e1b7a5d33")).toBeTruthy();
    expect(fails(idempotencyKey, "short")).toBe(true);
    expect(fails(idempotencyKey, "has spaces in it")).toBe(true);
  });
});

describe("pagination", () => {
  it("falls back to defaults on junk instead of throwing", () => {
    const schema = pagination(50, 200);
    expect(schema.parse({ limit: "abc", skip: "xyz" })).toEqual({
      limit: 50,
      skip: 0,
    });
  });

  it("clamps a client asking for everything", () => {
    const schema = pagination(50, 200);
    expect(schema.parse({ limit: "100000", skip: "0" }).limit).toBe(50);
    expect(schema.parse({ limit: "200", skip: "0" }).limit).toBe(200);
  });

  it("rejects a negative skip by falling back to zero", () => {
    expect(pagination().parse({ limit: "10", skip: "-5" }).skip).toBe(0);
  });
});

describe("queryObject", () => {
  it("flattens search params for a schema to parse", () => {
    const sp = new URLSearchParams("limit=10&q=coffee&sort=date_desc");
    expect(queryObject(sp)).toEqual({
      limit: "10",
      q: "coffee",
      sort: "date_desc",
    });
  });
});

describe("formatZodError", () => {
  it("produces a readable sentence, not a stack trace", () => {
    const schema = z.object({ amount: amountMajor, date: dateKey });
    const res = schema.safeParse({ amount: -1, date: "bad" });
    expect(res.success).toBe(false);
    const msg = formatZodError(res.error);
    expect(msg).toContain("amount");
    expect(msg).toContain("date");
    expect(msg).not.toMatch(/ZodError|at .*\.js:/);
  });
});

describe("blankAsAbsent", () => {
  const schema = z.object({ dueDate: blankAsAbsent(dateKey) });

  it("treats an empty string as absent, not malformed", () => {
    // An unfilled HTML input submits "" — rejecting that failed the whole
    // save over a field the user deliberately left blank.
    expect(schema.parse({ dueDate: "" }).dueDate).toBeUndefined();
  });

  it("treats null as absent too", () => {
    expect(schema.parse({ dueDate: null }).dueDate).toBeUndefined();
  });

  it("accepts a missing key", () => {
    expect(schema.parse({}).dueDate).toBeUndefined();
  });

  it("still validates a supplied value", () => {
    expect(schema.parse({ dueDate: "2026-03-05" }).dueDate).toBe("2026-03-05");
    expect(schema.safeParse({ dueDate: "nope" }).success).toBe(false);
  });
});

describe("clearable", () => {
  const schema = z.object({ targetDate: clearableDateKey });

  it("distinguishes absent from cleared", () => {
    // The distinction a PATCH depends on: absent means leave the stored
    // value alone, blank means remove it.
    expect(schema.parse({}).targetDate).toBeUndefined();
    expect(schema.parse({ targetDate: "" }).targetDate).toBeNull();
  });

  it("treats an explicit null as a clear", () => {
    expect(schema.parse({ targetDate: null }).targetDate).toBeNull();
  });

  it("still validates a supplied value", () => {
    expect(schema.parse({ targetDate: "2026-06-01" }).targetDate).toBe("2026-06-01");
    expect(schema.safeParse({ targetDate: "2026-6-1" }).success).toBe(false);
  });

  it("never confuses a clear with a valid value", () => {
    const cleared = schema.parse({ targetDate: "" }).targetDate;
    expect(cleared).toBeNull();
    expect(cleared).not.toBe("");
    expect(cleared).not.toBeUndefined();
  });
});

describe("optionalRate", () => {
  const schema = z.object({ interestRate: optionalRate });

  it("defaults a blank rate to zero — no interest, not an error", () => {
    expect(schema.parse({ interestRate: "" }).interestRate).toBe(0);
    expect(schema.parse({}).interestRate).toBe(0);
    expect(schema.parse({ interestRate: null }).interestRate).toBe(0);
  });

  it("accepts a real rate as a string or number", () => {
    expect(schema.parse({ interestRate: "12.5" }).interestRate).toBe(12.5);
    expect(schema.parse({ interestRate: 7 }).interestRate).toBe(7);
  });

  it("rejects a negative or absurd rate", () => {
    expect(schema.safeParse({ interestRate: -1 }).success).toBe(false);
    expect(schema.safeParse({ interestRate: 5000 }).success).toBe(false);
    expect(schema.safeParse({ interestRate: "abc" }).success).toBe(false);
  });
});
