import { NextResponse } from "next/server";

/**
 * Edge middleware: security headers, an origin check on mutations, and a
 * cheap auth gate.
 *
 * Three notes on what this deliberately does *not* do.
 *
 * **It does not verify the session.** Verifying a JWT here would mean
 * importing the NextAuth config, which pulls mongoose and bcrypt into the
 * edge runtime. Instead this checks only for the *presence* of a session
 * cookie and redirects when it is absent — which handles the common case
 * (not signed in, clicked a bookmark) without a database round trip.
 *
 * The real check is in every API route's `withRoute` and in every server
 * action, all of which validate the token properly and are the only things
 * standing between a request and anyone's data. A forged or expired cookie
 * gets past this, reaches an app shell that holds no data of its own, and
 * is turned away by `/api/me` — which is what sends it to sign in. See the
 * note in `components/app-user.jsx`.
 *
 * **The origin check is defence in depth, not the CSRF story.** SameSite=Lax
 * on the session cookie already blocks the cross-site form POST, and a
 * cross-origin `fetch` with `application/json` needs a CORS preflight we
 * never grant. This makes that protection explicit so a future change to
 * cookie settings does not silently remove all of it.
 *
 * **CSP ships in report-only.** The app has one inline script — the theme
 * initialiser in `app/layout.js`, which must run before paint to avoid a
 * flash — and turning CSP on enforcing before that carries a nonce would
 * break theming. Report-only gathers violations first.
 */

/** Cookie names NextAuth v5 uses, depending on protocol. */
const SESSION_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  // v4 names, in case an old cookie is still around.
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
];

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Routes that must not require a session.
 * Everything else under /app and /api does.
 */
const PUBLIC_API = [
  "/api/auth", // NextAuth's own endpoints
  "/api/register",
  "/api/password-reset",
  // Signed-out visitors can send feedback; the route attaches a user id
  // itself when a session exists.
  "/api/feedback",
  "/api/health",
  "/api/cron", // guarded by CRON_SECRET instead
];

function isPublicApi(pathname) {
  return PUBLIC_API.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function hasSessionCookie(request) {
  return SESSION_COOKIES.some((name) => request.cookies.has(name));
}

/**
 * Content-Security-Policy.
 *
 * `'unsafe-inline'` for styles is unavoidable with Tailwind's runtime style
 * injection and React's `style` props. Scripts get `'unsafe-inline'` only
 * because of the pre-paint theme script; once that carries a nonce this can
 * tighten and move to enforcing.
 */
function contentSecurityPolicy() {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://lh3.googleusercontent.com",
    "font-src 'self' data:",
    // Groq is called server-side only, so the browser needs nothing outbound
    // beyond our own origin.
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    // `upgrade-insecure-requests` is deliberately absent: browsers ignore it
    // in a report-only policy and log a console warning on every page load.
    // HSTS below already forces https in production, so nothing is lost.
  ].join("; ");
}

function applySecurityHeaders(response) {
  const headers = response.headers;

  // Clickjacking. `frame-ancestors` in CSP is the modern form; this covers
  // older browsers.
  headers.set("X-Frame-Options", "DENY");
  // Stop browsers second-guessing declared content types.
  headers.set("X-Content-Type-Options", "nosniff");
  // Don't leak the full URL of a financial app in referrers.
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  // The microphone is allowed for our own origin only (voice quick-add);
  // nothing needs a camera or location.
  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(self), geolocation=(), payment=()"
  );
  headers.set("X-DNS-Prefetch-Control", "off");
  headers.set("Content-Security-Policy-Report-Only", contentSecurityPolicy());

  // HSTS only in production: sending it from localhost would pin http://
  // localhost to https:// in the developer's browser, which is painful to undo.
  if (process.env.NODE_ENV === "production") {
    headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload"
    );
  }

  return response;
}

export function middleware(request) {
  const { pathname, origin } = request.nextUrl;

  /* ---- origin check on mutations ---------------------------------- */
  if (MUTATING_METHODS.has(request.method)) {
    const requestOrigin = request.headers.get("origin");
    // A same-origin `fetch` always sends Origin. Its absence means a
    // non-browser client (curl, a server-to-server call), which carries no
    // ambient cookies and so is not a CSRF vector.
    if (requestOrigin && requestOrigin !== origin) {
      return applySecurityHeaders(
        NextResponse.json(
          { error: "Request blocked: cross-origin.", code: "forbidden" },
          { status: 403 }
        )
      );
    }
  }

  /* ---- auth gate --------------------------------------------------- */
  /**
   * `/sysadmin` is listed here only so an unauthenticated visitor is bounced
   * to sign-in rather than shown a loading shell. The **role** check is not
   * done here — that needs a database read, which the edge runtime cannot do
   * without dragging mongoose into it. Authorisation lives in the admin
   * layout and in `withAdminRoute`, both of which re-read the role from the
   * database on every request.
   */
  const needsSession =
    pathname.startsWith("/app") ||
    pathname.startsWith("/sysadmin") ||
    (pathname.startsWith("/api") && !isPublicApi(pathname));

  if (needsSession && !hasSessionCookie(request)) {
    // API callers get a JSON 401; a browser gets sent to sign in with the
    // destination preserved so it lands where it meant to go.
    if (pathname.startsWith("/api")) {
      return applySecurityHeaders(
        NextResponse.json(
          { error: "Unauthorized", code: "unauthorized" },
          { status: 401 }
        )
      );
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return applySecurityHeaders(NextResponse.redirect(loginUrl));
  }

  return applySecurityHeaders(NextResponse.next());
}

export const config = {
  /**
   * Everything except Next's own static output and public files. Static
   * assets are excluded because they are served from the CDN edge and adding
   * headers per request costs without benefit.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$).*)",
  ],
};
