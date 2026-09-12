/**
 * Request rate limiting.
 *
 * Two backends behind one interface. When `UPSTASH_REDIS_REST_URL` and
 * `UPSTASH_REDIS_REST_TOKEN` are set we count in Redis over its REST API
 * (plain `fetch`, no SDK); otherwise we fall back to an in-process Map.
 *
 * **The fallback is not production-grade and says so.** Vercel runs many
 * instances, and an in-memory counter is bypassed simply by being routed
 * elsewhere — so a deploy without Redis configured is rate limited only
 * incidentally. `assertLimiterReady()` exists so the env check can refuse
 * to let that ship quietly.
 *
 * The algorithm is a fixed window, chosen deliberately: it costs one Redis
 * round-trip, and the worst case (a burst straddling a window boundary
 * allowing up to 2× the limit) is irrelevant for the abuse we care about —
 * credential stuffing and AI-cost draining both need sustained volume, not
 * a one-second burst.
 */

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

/** True when a shared, multi-instance-safe counter is available. */
export const hasSharedLimiter = Boolean(REDIS_URL && REDIS_TOKEN);

/**
 * Per-endpoint-class policies. `limit` requests per `windowSec`.
 *
 * Auth is strict because the threat is credential stuffing; AI is strict
 * because every call costs money and the quota is shared across all users;
 * reads are loose because they are cheap and legitimate use is bursty.
 */
export const POLICIES = {
  /** Login attempts. Paired with per-account lockout in lib/auth.js. */
  auth: { limit: 5, windowSec: 15 * 60 },
  /** Account creation. */
  signup: { limit: 3, windowSec: 60 * 60 },
  /**
   * Sending a reset email. Strict, because each one costs a send and an
   * unthrottled endpoint can mailbomb an address.
   */
  passwordReset: { limit: 3, windowSec: 60 * 60 },
  /**
   * Checking and consuming a reset token — deliberately looser than sending.
   *
   * These must not share a budget. Someone who requested two resets (say the
   * first mail was slow) would otherwise have spent the allowance and be
   * locked out of *using* the link they did receive, which is precisely the
   * situation the whole flow exists to rescue them from. Tokens are 256 bits
   * of entropy, so a generous limit costs nothing in guessability.
   */
  passwordResetToken: { limit: 30, windowSec: 60 * 60 },
  /** Anything that calls Groq. Also capped per day below. */
  ai: { limit: 10, windowSec: 60 * 60 },
  aiDaily: { limit: 40, windowSec: 24 * 60 * 60 },
  /** Ordinary authenticated writes. */
  write: { limit: 60, windowSec: 60 },
  /** Ordinary authenticated reads. */
  read: { limit: 240, windowSec: 60 },
  /** CSV import — expensive, and a legitimate user does it rarely. */
  importCsv: { limit: 5, windowSec: 60 * 60 },
  /** Feedback submission. */
  feedback: { limit: 10, windowSec: 60 * 60 },
};

/* ------------------------------------------------------------------ */
/* In-process fallback                                                 */
/* ------------------------------------------------------------------ */

/** @type {Map<string, {count: number, resetAt: number}>} */
const memory = global.__rateLimitMemory || new Map();
global.__rateLimitMemory = memory;

/** Drop expired buckets so the Map cannot grow without bound. */
function sweep(now) {
  if (memory.size < 5000) return;
  for (const [k, v] of memory) if (v.resetAt <= now) memory.delete(k);
}

function memoryHit(key, limit, windowSec) {
  const now = Date.now();
  sweep(now);
  const existing = memory.get(key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowSec * 1000;
    memory.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }
  existing.count += 1;
  return {
    allowed: existing.count <= limit,
    remaining: Math.max(0, limit - existing.count),
    resetAt: existing.resetAt,
  };
}

/* ------------------------------------------------------------------ */
/* Redis backend                                                       */
/* ------------------------------------------------------------------ */

/**
 * INCR the counter and, when it is new, set its TTL — pipelined into one
 * request so a burst cannot slip between the two commands and create a key
 * that never expires.
 */
async function redisHit(key, limit, windowSec) {
  const res = await fetch(`${REDIS_URL}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      ["INCR", key],
      ["EXPIRE", key, String(windowSec), "NX"],
      ["TTL", key],
    ]),
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`Redis responded ${res.status}`);
  const body = await res.json();
  const count = Number(body?.[0]?.result ?? 0);
  const ttl = Number(body?.[2]?.result ?? windowSec);

  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    resetAt: Date.now() + (ttl > 0 ? ttl : windowSec) * 1000,
  };
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Consume one unit against a policy.
 *
 * Fails **open** on a Redis error: a limiter outage must not take the
 * whole app down with it. That is the right trade for this app — the
 * limiter protects against cost and brute force, not against data loss —
 * but it means Redis availability needs monitoring, not just configuring.
 *
 * @param {string} identifier caller identity — user id, else IP
 * @param {keyof typeof POLICIES} policyName
 * @param {string} [scope] extra key segment, e.g. the route name
 * @returns {Promise<{allowed: boolean, remaining: number, resetAt: number, retryAfterSec: number}>}
 */
export async function rateLimit(identifier, policyName, scope = "") {
  const policy = POLICIES[policyName];
  if (!policy) throw new Error(`Unknown rate-limit policy: ${policyName}`);

  const key = `rl:${policyName}:${scope}:${identifier}`;
  let result;
  try {
    result = hasSharedLimiter
      ? await redisHit(key, policy.limit, policy.windowSec)
      : memoryHit(key, policy.limit, policy.windowSec);
  } catch {
    return {
      allowed: true,
      remaining: policy.limit,
      resetAt: Date.now() + policy.windowSec * 1000,
      retryAfterSec: 0,
      degraded: true,
    };
  }

  return {
    ...result,
    retryAfterSec: Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000)),
  };
}

/**
 * Apply several policies at once — used where both an hourly and a daily
 * cap apply. Returns the first refusal, so the caller sees the binding
 * limit rather than an arbitrary one.
 * @param {string} identifier
 * @param {Array<keyof typeof POLICIES>} policyNames
 * @param {string} [scope]
 */
export async function rateLimitAll(identifier, policyNames, scope = "") {
  for (const name of policyNames) {
    const result = await rateLimit(identifier, name, scope);
    if (!result.allowed) return { ...result, policy: name };
  }
  return { allowed: true };
}

/**
 * Best-effort client IP. Trusts `x-forwarded-for` because on Vercel it is
 * set by the platform edge, not the client; behind any other proxy this
 * assumption has to be re-checked.
 * @param {Request} request
 */
export function clientIp(request) {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return (
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

/**
 * Clear a counter — called after a *successful* login so one person
 * fumbling their password then getting it right is not left throttled.
 * @param {string} identifier
 * @param {keyof typeof POLICIES} policyName
 * @param {string} [scope]
 */
export async function resetLimit(identifier, policyName, scope = "") {
  const key = `rl:${policyName}:${scope}:${identifier}`;
  if (!hasSharedLimiter) {
    memory.delete(key);
    return;
  }
  try {
    await fetch(`${REDIS_URL}/del/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
      cache: "no-store",
    });
  } catch {
    // A stale counter expires on its own; not worth failing the request.
  }
}

/**
 * Throw when the app is configured for production without a shared
 * limiter. Called from the env validator so this cannot ship unnoticed.
 */
export function assertLimiterReady() {
  if (process.env.NODE_ENV === "production" && !hasSharedLimiter) {
    return [
      "Rate limiting is running on the in-memory fallback in production. " +
        "Serverless runs multiple instances, so limits are trivially bypassed. " +
        "Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.",
    ];
  }
  return [];
}
