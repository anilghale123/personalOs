/**
 * Environment validation, asserted once at boot.
 *
 * The failure mode this replaces is the quiet one. A missing `MONGODB_URI`
 * threw loudly, but a missing `AUTH_SECRET` failed at first sign-in, and a
 * missing Google pair did not fail at all — the "Continue with Google"
 * button simply did not render, which looks like a product decision rather
 * than a broken deploy.
 *
 * Two severities. **Required** vars abort the process: without them the app
 * is not merely degraded, it is wrong. **Warnings** are things that
 * silently disable a feature or weaken a guarantee — logged loudly at boot
 * so a deploy tells you what it is missing instead of waiting for a user
 * to find out.
 */

import { assertLimiterReady } from "@/lib/rate-limit";

/** Vars without which the app must not start. */
const REQUIRED = [
  {
    key: "MONGODB_URI",
    why: "No database connection is possible.",
    check: (v) => v.startsWith("mongodb://") || v.startsWith("mongodb+srv://"),
    checkWhy: "must start with mongodb:// or mongodb+srv://",
  },
  {
    key: "AUTH_SECRET",
    why: "Sessions cannot be signed, so nobody can log in.",
    check: (v) => v.length >= 32,
    checkWhy: "must be at least 32 characters — generate with `openssl rand -base64 32`",
    // NextAuth reads either name.
    alternates: ["NEXTAUTH_SECRET"],
  },
];

/** Vars whose absence disables a feature or weakens a guarantee. */
const RECOMMENDED = [
  {
    key: "GROQ_API_KEY",
    effect: "AI briefings, reflections and narration will fail at call time.",
  },
  {
    key: "AUTH_GOOGLE_ID",
    alternates: ["GOOGLE_CLIENT_ID"],
    effect:
      '"Continue with Google" will not render at all — for every user, with no error.',
  },
  {
    key: "AUTH_GOOGLE_SECRET",
    alternates: ["GOOGLE_CLIENT_SECRET"],
    effect:
      '"Continue with Google" will not render at all — for every user, with no error.',
  },
  {
    key: "CRON_SECRET",
    effect:
      "The NEPSE cron route rejects every call, so prices stop updating.",
  },
  {
    key: "RESEND_API_KEY",
    effect:
      "Password reset emails cannot be sent, so a locked-out user has no way back in.",
  },
  {
    key: "UPSTASH_REDIS_REST_URL",
    alternates: [],
    effect:
      "Rate limiting falls back to per-instance memory, which serverless bypasses.",
  },
];

/** Read a var, honouring its alternate spellings. */
function read(spec) {
  const names = [spec.key, ...(spec.alternates ?? [])];
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim()) return value.trim();
  }
  return null;
}

/**
 * Validate the environment.
 * @returns {{errors: string[], warnings: string[]}}
 */
export function checkEnv() {
  const errors = [];
  const warnings = [];

  for (const spec of REQUIRED) {
    const value = read(spec);
    if (!value) {
      errors.push(`${spec.key} is missing. ${spec.why}`);
      continue;
    }
    if (spec.check && !spec.check(value)) {
      errors.push(`${spec.key} is invalid — ${spec.checkWhy}.`);
    }
    // A placeholder copied from .env.example is worse than a missing value,
    // because it looks configured.
    if (/replace-with|your-|xxx|changeme/i.test(value)) {
      errors.push(
        `${spec.key} still holds a placeholder from .env.example. Set a real value.`
      );
    }
  }

  for (const spec of RECOMMENDED) {
    if (!read(spec)) warnings.push(`${spec.key} is not set — ${spec.effect}`);
  }

  // Google is all-or-nothing: one half configured is always a mistake.
  const googleId = read({ key: "AUTH_GOOGLE_ID", alternates: ["GOOGLE_CLIENT_ID"] });
  const googleSecret = read({
    key: "AUTH_GOOGLE_SECRET",
    alternates: ["GOOGLE_CLIENT_SECRET"],
  });
  if (Boolean(googleId) !== Boolean(googleSecret)) {
    errors.push(
      "Google OAuth is half-configured: set both AUTH_GOOGLE_ID and " +
        "AUTH_GOOGLE_SECRET, or neither. One without the other silently " +
        "disables the sign-in button."
    );
  }

  warnings.push(...assertLimiterReady());

  /**
   * Runtime-only checks.
   *
   * `next build` runs with NODE_ENV=production, so a plain NODE_ENV test
   * would fail a local build over a localhost URL that is entirely correct
   * for local development. `NEXT_PHASE` distinguishes the two, and during a
   * build these are warnings so a genuine misconfiguration still gets said
   * out loud without breaking the build.
   */
  const url = process.env.NEXTAUTH_URL || process.env.AUTH_URL;
  const localhostUrl = Boolean(url && /localhost|127\.0\.0\.1/.test(url));

  /**
   * Only fatal on a real deployment.
   *
   * `next start` on a developer's machine runs with NODE_ENV=production and a
   * localhost URL, which is completely correct — it is how you test a
   * production build. Refusing to boot there made the check impossible to live
   * with. What is genuinely broken is a *deployed* app pointing at localhost,
   * which `isDeployed()` identifies by the platform's own env vars.
   */
  if (isDeployed() && localhostUrl) {
    errors.push(
      `NEXTAUTH_URL points at localhost (${url}) on a deployed instance — ` +
        "every OAuth callback will fail. Set it to the real public origin."
    );
  } else if (isProductionRuntime() && localhostUrl) {
    warnings.push(
      `NEXTAUTH_URL is ${url} while running a production build. Fine locally; ` +
        "the deployed instance must set its real public origin."
    );
  } else if (isBuild() && localhostUrl) {
    warnings.push(
      `NEXTAUTH_URL is ${url} — fine for local development, but the ` +
        "production deployment must set its real origin, and that origin's " +
        "/api/auth/callback/google must be registered in Google Cloud Console."
    );
  }

  return { errors, warnings };
}

/** True while `next build` is collecting pages, rather than serving them. */
function isBuild() {
  return process.env.NEXT_PHASE === "phase-production-build";
}

/** True when actually serving production traffic (locally or deployed). */
function isProductionRuntime() {
  return process.env.NODE_ENV === "production" && !isBuild();
}

/**
 * True when running on a hosting platform rather than a developer's machine.
 *
 * Identified by the platform's own injected variables. This is what separates
 * "a deployed instance is misconfigured" — which must fail loudly — from
 * "someone is testing a production build locally", which is normal.
 */
function isDeployed() {
  if (!isProductionRuntime()) return false;
  return Boolean(
    process.env.VERCEL ||
      process.env.VERCEL_ENV ||
      process.env.NETLIFY ||
      process.env.RENDER ||
      process.env.FLY_APP_NAME ||
      process.env.RAILWAY_ENVIRONMENT ||
      process.env.AWS_EXECUTION_ENV ||
      process.env.K_SERVICE // Cloud Run
  );
}

let checked = false;

/**
 * Validate once per process and abort on a fatal problem.
 *
 * Called from the root layout, so a misconfigured deploy fails on its first
 * request with a readable message rather than at 2am inside an unrelated
 * feature.
 */
export function assertEnv() {
  if (checked) return;
  checked = true;

  const { errors, warnings } = checkEnv();

  for (const warning of warnings) {
    console.warn(`[env] ${warning}`);
  }

  if (errors.length) {
    const message = [
      "",
      "Environment is not valid — refusing to start:",
      ...errors.map((e) => `  • ${e}`),
      "",
      "See .env.example for the full list.",
      "",
    ].join("\n");
    throw new Error(message);
  }
}
