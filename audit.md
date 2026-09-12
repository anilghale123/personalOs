# SelfVue — Pre-Beta Readiness Audit & Optimization Plan

## Role & Context

You are acting as a senior full-stack engineer and technical auditor for **SelfVue**, a Next.js (JSX) web app with wealth tracking, habits, journaling, budgeting, and AI briefings. It is ~85% complete and about to go into a **limited beta with a small, known set of users**. I (the developer) built both frontend and backend myself.

**Your task right now is ASSESSMENT ONLY. Do not write or modify any code yet.**

Go through the entire codebase (frontend + backend + DB schema + API routes) and produce a single structured report covering every category below. For each category, flag issues as:

- 🔴 **Critical** — must fix before beta
- 🟡 **Important** — should fix soon, not release-blocking
- 🟢 **Nice-to-have** — post-beta

For every issue: name the file/location, explain the problem, explain the risk/impact, and give a one-line fix direction (no code yet). At the end, produce a **prioritized implementation plan** (ordered task list, grouped into phases) that I will review and approve before you implement anything.

---

## 1. Performance & Scalability

- Identify slow endpoints/pages and root causes (N+1 queries, missing indexes, unnecessary full-table scans, unpaginated fetches).
- Time complexity: flag any O(n²) or worse logic on lists/loops that will degrade as data grows (transactions, journal entries, habit logs).
- Space complexity: flag anything holding full datasets in memory/state instead of paginating or streaming.
- Identify what breaks first as user count or per-user data volume grows (specific tables/queries/components).
- Confirm DB indexes exist on frequently queried/filtered/sorted columns (userId, date, category, etc.).

## 2. Caching Strategy

- Identify where caching is missing but would help: read-heavy endpoints, dashboard aggregates, portfolio/stock price lookups, static reference data.
- Recommend appropriate caching layer per case (in-memory, Redis, Next.js `fetch` cache/ISR, SWR/React Query client cache, CDN).
- Flag any caching that could cause **stale or incorrect financial data** (this is higher risk than normal caching bugs — flag explicitly).
- Cache invalidation strategy: is there one? Where is it missing?

## 3. Security

- Auth: session/token handling, JWT expiry & refresh, storage (cookie flags: httpOnly, secure, sameSite), CSRF protection.
- Authorization: verify every API route checks that the requesting user owns the resource (no IDOR — e.g. user A editing user B's transaction by guessing an ID).
- Secrets: confirm no API keys/secrets are exposed client-side or committed to repo.
- Standard OWASP Top 10 pass: injection, broken auth, sensitive data exposure, XSS, SSRF, security misconfiguration.
- HTTPS enforcement, security headers (CSP, HSTS, X-Frame-Options).

## 4. Rate Limiting & Abuse Prevention

- Identify endpoints with no rate limiting (login, signup, password reset, OTP/email send, AI briefing generation — anything costly or abusable).
- Recommend limits per endpoint type (auth endpoints stricter than read endpoints).
- Brute-force protection on login (lockout/backoff/captcha threshold).

## 5. Input Validation & Sanitization

- Confirm server-side validation exists for every input (not just client-side) — schema validation library in use or missing.
- Sanitization for anything rendered back to the user (journaling/notes fields — stored XSS risk).
- Numeric/financial field validation: negative amounts, overflow, precision, currency handling, unexpected types.

## 6. Auth Flows

- Signup, login, logout: full correctness pass.
- Password reset: token expiry, single-use tokens, secure delivery, rate limiting.
- **"Continue with Google" — confirm it is actually enabled and working for all users, not partially configured; check redirect URI config, account-linking behavior if a user signs up via email first then tries Google with the same email (and vice versa).**
- Session expiry and refresh behavior; what happens to an active session when a password is reset elsewhere.

## 7. Business Logic & Money Correctness

- Floating-point vs decimal handling for all money values (flag any raw `float`/JS `Number` arithmetic on currency — this is a common silent-bug source).
- Rounding rules: consistent and defined, not incidental.
- Transaction/ledger integrity: can a race condition or partial failure double-count or drop an entry (e.g. concurrent writes, failed request retried)?
- SIP/portfolio calculations: verify formulas against expected financial logic, not just "doesn't crash."
- Idempotency: are money-affecting operations safe to retry (e.g. duplicate submit on slow network)?

## 8. Listing & Search

- Pagination present and correct on all list views (transactions, journal entries, habits).
- Search: server-side vs client-side filtering — does it scale past a few hundred records?
- Sort/filter combinations tested for correctness, not just default view.

## 9. Network & API Layer Under Load

- Concurrent request handling — what happens with multiple simultaneous requests from the same user (double-submit) or across users.
- Timeout and retry behavior on slow/failed API calls.
- Error responses: consistent shape, no leaking stack traces/internal details to the client.
- Loading/error/empty states handled on every data-fetching component (no silent failures).

## 10. Bundle Size & Rendering

- Identify what's rendered client-side vs server-side vs static — anything that should be SSR/ISR but isn't, or vice versa.
- Bundle size: large unused dependencies, missing code-splitting/dynamic imports for heavy components (charts, editors).
- Image optimization (Next.js `Image` usage, lazy loading).
- Unnecessary re-renders (missing memoization, prop drilling causing cascading renders) especially on dashboard/aggregate views.

## 11. Architecture & Code Quality

- Consistency of patterns across the codebase (API route structure, error handling, state management).
- Separation of concerns (business logic vs UI vs data access).
- Dead code, duplicated logic, TODOs left in.
- Environment config management (dev/prod separation, env var validation on startup).

## 12. Observability & Operational Readiness

- Logging: enough to debug a production issue, not leaking sensitive data (passwords, tokens, full financial details) into logs.
- Error tracking (is anything wired up — Sentry or similar — or just console.error?).
- Basic health-check endpoint for uptime monitoring.
- Backup/recovery: is there any DB backup strategy before real user data accumulates?

# 13. feedback

- there should be one feedback section as well where user can provide feedback what problem they are facing

## Output Format Required

1. **Executive summary** — 5-10 bullets, biggest risks only.
2. **Findings table by category** (category | issue | location | severity | risk | fix direction).
3. **Prioritized implementation plan** — phases (e.g. Phase 1: blockers before any beta user touches money data; Phase 2: important hardening; Phase 3: polish), with rough effort estimate per item.

**Do not implement any fixes yet.** Wait for my review and explicit approval of the plan before writing code.
