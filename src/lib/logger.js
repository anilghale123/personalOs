/**
 * Structured logging with a hard deny-list.
 *
 * This app stores financial history and private journal entries, so the
 * interesting question is not "is there enough logging" but "can logging
 * ever print something it must not". The deny-list below is enforced by
 * `redact()` on every object that goes through here, recursively, so an
 * incidental `log.error("failed", { body })` cannot leak a journal entry
 * or a password into a log aggregator.
 *
 * Nothing here is Sentry-specific. `captureException` forwards to Sentry
 * when `@sentry/nextjs` is installed and configured, and otherwise logs
 * locally — so the app is instrumented from day one and adding Sentry is
 * a dependency install, not a refactor.
 */

/**
 * Keys whose values are never logged, matched case-insensitively as a
 * substring so `passwordHash`, `newPassword` and `currentPassword` are all
 * caught by `password`.
 */
const DENY_KEYS = [
  "password",
  "passwordhash",
  "token",
  "secret",
  "authorization",
  "cookie",
  "apikey",
  "api_key",
  // Private user content — never useful in a log, always sensitive.
  "content",
  "note",
  "notes",
  "reflection",
  "aisummary",
  "narration",
  "explanation",
  "journal",
  // Money. A count or an id is fine; an amount is not.
  "amount",
  "amountpaisa",
  "totalamount",
  "balance",
  "principalpaisa",
  "targetpaisa",
  "monthlyamount",
  "amountinvested",
  "email",
];

const REDACTED = "[redacted]";
const MAX_DEPTH = 4;
const MAX_STRING = 300;

/**
 * Deep-copy a value with denied keys replaced. Depth-limited so a cyclic
 * or pathologically nested object cannot hang the logger.
 * @param {unknown} value
 * @param {number} [depth]
 */
export function redact(value, depth = 0) {
  if (value == null) return value;
  if (depth >= MAX_DEPTH) return "[truncated]";

  if (typeof value === "string") {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  }
  if (typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((v) => redact(v, depth + 1));
  }
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }

  const out = {};
  for (const [k, v] of Object.entries(value)) {
    const lower = k.toLowerCase();
    if (DENY_KEYS.some((denied) => lower.includes(denied))) {
      out[k] = REDACTED;
    } else {
      out[k] = redact(v, depth + 1);
    }
  }
  return out;
}

/** Emit one JSON line — greppable in Vercel's log drain. */
function emit(level, message, context) {
  const line = {
    level,
    message,
    at: new Date().toISOString(),
    ...(context ? { ctx: redact(context) } : {}),
  };
  const text = JSON.stringify(line);
  if (level === "error") console.error(text);
  else if (level === "warn") console.warn(text);
  else console.log(text);
}

export const log = {
  debug: (message, context) => {
    if (process.env.NODE_ENV !== "production") emit("debug", message, context);
  },
  info: (message, context) => emit("info", message, context),
  warn: (message, context) => emit("warn", message, context),
  error: (message, context) => emit("error", message, context),
};

/**
 * Report an unexpected error. Returns a short id the API layer hands to
 * the client, so a user can quote "error 4f2a9c" in a bug report and it
 * can be found in the logs without them describing anything sensitive.
 *
 * @param {unknown} error
 * @param {object} [context]
 * @returns {string} correlation id
 */
export function captureException(error, context = {}) {
  const errorId = Math.random().toString(16).slice(2, 8);

  // Forward to Sentry when it is present. Resolved lazily and guarded so
  // the app runs identically with or without the dependency installed.
  try {
    const Sentry = globalThis.__SENTRY__ ? globalThis.Sentry : null;
    if (Sentry?.captureException) {
      Sentry.captureException(error, {
        tags: { errorId },
        extra: redact(context),
      });
    }
  } catch {
    // Never let error reporting throw from inside error handling.
  }

  log.error(error instanceof Error ? error.message : "Unhandled error", {
    errorId,
    name: error instanceof Error ? error.name : typeof error,
    stack: error instanceof Error ? error.stack?.split("\n").slice(0, 6) : undefined,
    ...context,
  });

  return errorId;
}
