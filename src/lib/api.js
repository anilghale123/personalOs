/**
 * The API route contract.
 *
 * Every route handler goes through `withRoute`, which owns the five things
 * that were previously copy-pasted, done inconsistently, or forgotten:
 *
 *   1. session check        — 401 before the handler ever runs
 *   2. rate limiting        — per policy, keyed by user then IP
 *   3. input parsing        — zod for body, query and route params
 *   4. error handling       — every throw becomes a typed JSON envelope
 *   5. logging              — one structured line per request
 *
 * The single most important property: a raw driver error can no longer
 * reach the client. A Mongoose CastError from a junk id in the URL used to
 * escape as an unhandled 500; here it is a 400 with a fixed message, and
 * the real error goes to the logs with a correlation id.
 *
 * Response shape is always `{ error, code, errorId? }` on failure, so
 * client code can branch on `code` rather than string-matching prose.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongoose";
import { captureException, log } from "@/lib/logger";
import { clientIp, rateLimitAll } from "@/lib/rate-limit";
import { formatZodError, objectId } from "@/lib/validation";

/**
 * An error the client is allowed to see the message of. Anything that is
 * not an `ApiError` is treated as a bug and its message is withheld.
 */
export class ApiError extends Error {
  /**
   * @param {number} status
   * @param {string} message user-facing
   * @param {string} [code] machine-readable
   * @param {object} [extra] merged into the response body
   */
  constructor(status, message, code = "error", extra = undefined) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export const badRequest = (message, extra) =>
  new ApiError(400, message, "bad_request", extra);
export const unauthorized = (message = "Unauthorized") =>
  new ApiError(401, message, "unauthorized");
export const forbidden = (message = "Not allowed.") =>
  new ApiError(403, message, "forbidden");
export const notFound = (message = "Not found") =>
  new ApiError(404, message, "not_found");
export const conflict = (message, extra) =>
  new ApiError(409, message, "conflict", extra);
export const tooMany = (message, retryAfterSec) =>
  new ApiError(429, message, "rate_limited", { retryAfterSec });

/** JSON response helper. */
export function json(data, init) {
  return NextResponse.json(data, init);
}

/**
 * Map an unknown thrown value to a client-safe response.
 * @param {unknown} err
 * @param {object} logContext
 */
function toResponse(err, logContext) {
  if (err instanceof ApiError) {
    // Expected, already user-facing. Logged at warn so it is visible
    // without polluting the error stream.
    if (err.status >= 500) captureException(err, logContext);
    else log.warn(`${logContext.route} → ${err.status}`, { ...logContext, code: err.code });
    return NextResponse.json(
      { error: err.message, code: err.code, ...(err.extra ?? {}) },
      { status: err.status }
    );
  }

  // Mongoose: a junk id in the path. Previously an unhandled 500.
  if (err?.name === "CastError") {
    log.warn("Invalid id in request", { ...logContext, path: err.path });
    return NextResponse.json(
      { error: "Not found", code: "not_found" },
      { status: 404 }
    );
  }

  // Mongoose schema validation — our zod layer should have caught this
  // first, so reaching here means a schema and a route disagree.
  if (err?.name === "ValidationError") {
    captureException(err, logContext);
    return NextResponse.json(
      { error: "Some of those details were not valid.", code: "bad_request" },
      { status: 400 }
    );
  }

  // Duplicate key. Which unique index fired is internal; the caller only
  // needs to know the thing already exists.
  if (err?.code === 11000) {
    log.warn("Duplicate key", { ...logContext, keyPattern: err.keyPattern });
    return NextResponse.json(
      { error: "That already exists.", code: "conflict" },
      { status: 409 }
    );
  }

  // Anything else is a bug. Withhold the message, keep the id.
  const errorId = captureException(err, logContext);
  return NextResponse.json(
    {
      error: "Something went wrong on our side. Please try again.",
      code: "internal",
      errorId,
    },
    { status: 500 }
  );
}

/**
 * Wrap a route handler.
 *
 * @template T
 * @param {object} options
 * @param {boolean} [options.auth=true] require a session
 * @param {boolean} [options.db=true] connect to Mongo before the handler
 * @param {string|string[]} [options.limit] rate-limit policy name(s)
 * @param {import('zod').ZodTypeAny} [options.body] schema for the JSON body
 * @param {import('zod').ZodTypeAny} [options.query] schema for search params
 * @param {string[]} [options.params] route params that must be ObjectIds
 * @param {(ctx: object) => Promise<Response|object>} handler
 * @returns {(request: Request, routeCtx: object) => Promise<Response>}
 */
export function withRoute(options, handler) {
  const {
    auth: needsAuth = true,
    db: needsDb = true,
    limit,
    body: bodySchema,
    query: querySchema,
    params: idParams,
  } = options;

  return async function route(request, routeCtx = {}) {
    const started = Date.now();
    const method = request.method;
    const url = new URL(request.url);
    const logContext = { route: `${method} ${url.pathname}` };

    try {
      /* 1. Session ------------------------------------------------- */
      let session = null;
      let userId = null;
      if (needsAuth) {
        session = await auth();
        userId = session?.user?.id ?? null;
        if (!userId) throw unauthorized();
        logContext.userId = userId;
      }

      /* 2. Rate limit ---------------------------------------------- */
      if (limit) {
        const policies = Array.isArray(limit) ? limit : [limit];
        const identity = userId || clientIp(request);
        const verdict = await rateLimitAll(identity, policies, url.pathname);
        if (!verdict.allowed) {
          throw tooMany(
            "You're doing that a bit too often. Please wait a moment and try again.",
            verdict.retryAfterSec
          );
        }
      }

      /* 3. Route params -------------------------------------------- */
      // `params` is a promise in Next 15 and a plain object in 14; await
      // handles both so this survives the upgrade.
      const rawParams = (await routeCtx.params) ?? {};
      const params = { ...rawParams };
      for (const name of idParams ?? []) {
        const parsed = objectId.safeParse(params[name]);
        // A malformed id is indistinguishable from a missing record as far
        // as the caller is concerned, and 404 leaks less than 400 here.
        if (!parsed.success) throw notFound();
        params[name] = parsed.data;
      }

      /* 4. Input --------------------------------------------------- */
      let input;
      if (bodySchema) {
        let raw;
        try {
          raw = await request.json();
        } catch {
          throw badRequest("Expected a JSON body.");
        }
        const parsed = bodySchema.safeParse(raw);
        if (!parsed.success) throw badRequest(formatZodError(parsed.error));
        input = parsed.data;
      }

      let query;
      if (querySchema) {
        const raw = Object.fromEntries(url.searchParams.entries());
        const parsed = querySchema.safeParse(raw);
        if (!parsed.success) throw badRequest(formatZodError(parsed.error));
        query = parsed.data;
      }

      /* 5. Handler ------------------------------------------------- */
      if (needsDb) await connectDB();

      const result = await handler({
        request,
        session,
        userId,
        params,
        input,
        query,
        url,
      });

      log.info(logContext.route, {
        ...logContext,
        ms: Date.now() - started,
        status: result instanceof Response ? result.status : 200,
      });

      return result instanceof Response ? result : NextResponse.json(result);
    } catch (err) {
      return toResponse(err, { ...logContext, ms: Date.now() - started });
    }
  };
}

/**
 * Assert a document exists, else 404. Used after every scoped query so the
 * "did this belong to the caller" check and the "does it exist" check are
 * the same check — which is what keeps IDOR impossible here.
 * @template T
 * @param {T|null|undefined} doc
 * @param {string} [message]
 * @returns {T}
 */
export function must(doc, message = "Not found") {
  if (!doc) throw notFound(message);
  return doc;
}
