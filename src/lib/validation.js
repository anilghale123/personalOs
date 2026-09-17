/**
 * Shared request-validation primitives.
 *
 * Every API route parses its input through a zod schema built from these,
 * so validation is uniform rather than however careful we were that day.
 * The rule: parse at the boundary, and nothing downstream re-checks.
 *
 * Money deserves special mention. `amountMajor` accepts what a human typed
 * into a rupee field and hands back **integer paisa**, because that is the
 * only representation the rest of the app is allowed to do arithmetic on
 * (see lib/money.js). A float never survives past this layer.
 */

import { z } from "zod";
import { toMinorUnits } from "@/lib/money";

/** 'YYYY-MM-DD' — a local calendar date, never a UTC timestamp. */
export const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The largest amount we accept, in paisa — NPR 10 billion. Chosen to be
 * comfortably beyond any real personal figure while staying far below
 * `Number.MAX_SAFE_INTEGER`, so sums of many entries cannot silently lose
 * precision.
 */
export const MAX_AMOUNT_PAISA = 1_000_000_000_000;

/** A 24-character hex Mongo ObjectId. */
export const objectId = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Not a valid id.");

/**
 * An optional id that accepts a blank form field — a `<select>` with no
 * choice made submits `""`, which is "none", not "malformed".
 * Declared after `blankAsAbsent` below, so see that for the reasoning.
 */

/** A calendar date key, validated but not coerced. */
export const dateKey = z
  .string()
  .regex(DATE_KEY_RE, "Expected a YYYY-MM-DD date.")
  .refine((s) => !Number.isNaN(Date.parse(s)), "Not a real date.");

/**
 * Treat an empty string as absent.
 *
 * An unfilled HTML input submits `""`, not `undefined`, so a form that leaves
 * "due date" or "parent category" blank sends an empty string. A plain
 * `.optional()` rejects that as malformed and the whole save fails with a
 * confusing error about a field the user deliberately left empty.
 *
 * Use this to wrap any optional field a form can submit blank.
 * @template T
 * @param {T} schema
 */
export function blankAsAbsent(schema) {
  return z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    schema.optional()
  );
}

/** An optional date that accepts a blank form field. */
export const optionalDateKey = blankAsAbsent(dateKey);

/** An optional ObjectId that accepts a blank form field. */
export const optionalObjectId = blankAsAbsent(objectId);

/**
 * A field a PATCH can *clear*.
 *
 * Three states, and they are genuinely distinct on an update:
 *   - `undefined` — not supplied, leave whatever is stored alone
 *   - `null`      — supplied as blank, **remove** the stored value
 *   - a value     — supplied, validated, store it
 *
 * `blankAsAbsent` collapses the first two, which is right for a create (blank
 * means "no date") and wrong for an update (the dialogs send the whole form,
 * so a blank field means the user cleared it). Routes using this must apply
 * `null` with `$unset`, not `$set: undefined` — Mongoose strips undefined from
 * `$set`, so the old value would silently survive.
 *
 * @template T
 * @param {T} schema
 */
export function clearable(schema) {
  return z.preprocess(
    (v) => (v === "" ? null : v),
    schema.nullish()
  );
}

/** A 24-hour 'HH:mm' clock time, as an `<input type="time">` sends it. */
export const clockTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a time like 06:00.");

/** A date a PATCH can clear by sending it blank. */
export const clearableDateKey = clearable(dateKey);

/**
 * An optional number that accepts a blank form field, defaulting to 0.
 * A blank "interest rate" means zero interest, not an invalid request.
 */
export const optionalRate = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? 0 : v),
  z.union([z.number(), z.string()]).transform((v, ctx) => {
    const n = typeof v === "string" ? Number(v.trim()) : v;
    if (!Number.isFinite(n) || n < 0 || n > 1000) {
      ctx.addIssue({ code: "custom", message: "Enter a valid rate." });
      return z.NEVER;
    }
    return n;
  })
);

/**
 * A rupee amount as typed by a user → integer paisa.
 * Rejects negatives, zero, NaN, Infinity and anything unparseable.
 */
export const amountMajor = z
  .union([z.number(), z.string()])
  .transform((v, ctx) => {
    const n = typeof v === "string" ? Number(v.trim()) : v;
    if (!Number.isFinite(n)) {
      ctx.addIssue({ code: "custom", message: "Enter a valid amount." });
      return z.NEVER;
    }
    if (n <= 0) {
      ctx.addIssue({ code: "custom", message: "Amount must be more than zero." });
      return z.NEVER;
    }
    const paisa = toMinorUnits(n);
    if (paisa <= 0 || paisa > MAX_AMOUNT_PAISA) {
      ctx.addIssue({ code: "custom", message: "That amount is out of range." });
      return z.NEVER;
    }
    return paisa;
  });

/**
 * A plain positive quantity that is *not* money — share counts, NAV per
 * unit, habit values. Still must be finite and in range; the whole reason
 * `NaN` reached the database was a field like this going unchecked.
 */
export const positiveNumber = (max = 1e12) =>
  z
    .union([z.number(), z.string()])
    .transform((v, ctx) => {
      const n = typeof v === "string" ? Number(v.trim()) : v;
      if (!Number.isFinite(n)) {
        ctx.addIssue({ code: "custom", message: "Enter a valid number." });
        return z.NEVER;
      }
      if (n <= 0 || n > max) {
        ctx.addIssue({ code: "custom", message: "That number is out of range." });
        return z.NEVER;
      }
      return n;
    });

/** A finite number that may be zero or negative, within bounds. */
export const finiteNumber = (min = -1e12, max = 1e12) =>
  z
    .union([z.number(), z.string()])
    .transform((v, ctx) => {
      const n = typeof v === "string" ? Number(v.trim()) : v;
      if (!Number.isFinite(n) || n < min || n > max) {
        ctx.addIssue({ code: "custom", message: "Enter a valid number." });
        return z.NEVER;
      }
      return n;
    });

/**
 * Free text with a hard ceiling. Unbounded user text is both a storage
 * problem and — the day anything renders it as Markdown — an injection
 * surface, so every string field gets a limit at the boundary.
 */
export const text = (max, { trim = true } = {}) => {
  const base = z.string().max(max, `Keep this under ${max} characters.`);
  return trim ? base.transform((s) => s.trim()) : base;
};

/**
 * Optional free text — empty string and null both become undefined.
 *
 * The trailing `.optional()` is load-bearing and easy to lose. In zod 4 a
 * union that *includes* `z.undefined()` accepts an explicit `undefined` value
 * but still rejects an **omitted key** — they are different things, and the
 * error ("expected nonoptional, received undefined") does not make that
 * obvious. Without it, any route with an optional note field rejected every
 * request that simply left the note out, which is the normal case.
 */
export const optionalText = (max) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((s) => {
      if (s == null) return undefined;
      const t = String(s).trim();
      return t ? t.slice(0, max) : undefined;
    })
    .optional();

/** A tag list: deduplicated, trimmed, capped in both count and length. */
export const tagList = z
  .array(z.string())
  .max(25)
  .transform((tags) => [
    ...new Set(
      tags
        .map((t) => String(t).trim().slice(0, 40))
        .filter(Boolean)
    ),
  ]);

/**
 * An email, normalised to lowercase.
 *
 * Normalise *before* validating, not after: zod checks the format first,
 * so a trailing space from a phone keyboard would otherwise be rejected
 * as a malformed address rather than trimmed away.
 */
export const email = z.preprocess(
  (v) => (typeof v === "string" ? v.trim().toLowerCase() : v),
  z.string().min(3).max(254).regex(
    /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/,
    "Enter a valid email address."
  )
);

/**
 * A password. Ten characters is the floor — the previous six-character
 * minimum is below every current guideline, and this is an app holding
 * financial history.
 */
export const password = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(200, "That password is too long.");

/**
 * A client-generated idempotency key. Money-affecting writes carry one so
 * a retried or double-tapped request cannot post the same entry twice.
 */
export const idempotencyKey = z
  .string()
  .min(8)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "Not a valid key.");

/** Pagination, with a hard server-side ceiling whatever the client asks. */
export const pagination = (defaultLimit = 50, maxLimit = 200) =>
  z.object({
    limit: z.coerce.number().int().positive().max(maxLimit).catch(defaultLimit),
    skip: z.coerce.number().int().min(0).max(100_000).catch(0),
  });

/**
 * Turn a `URLSearchParams` into a plain object so a zod schema can parse
 * it. Repeated keys keep their last value, matching `.get()` semantics.
 * @param {URLSearchParams} searchParams
 */
export function queryObject(searchParams) {
  const out = {};
  for (const [k, v] of searchParams.entries()) out[k] = v;
  return out;
}

/**
 * Flatten a zod error into one human-readable sentence, field-prefixed.
 * This is what the user sees, so it must read as guidance and never as a
 * stack trace.
 * @param {import('zod').ZodError} err
 */
export function formatZodError(err) {
  const issues = err.issues ?? [];
  if (!issues.length) return "That request was not valid.";
  return issues
    .slice(0, 4)
    .map((i) => {
      const path = i.path?.filter((p) => typeof p !== "number").join(".");
      return path ? `${path}: ${i.message}` : i.message;
    })
    .join(" ");
}

export { z };
