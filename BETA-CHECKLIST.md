# Beta readiness — what's done, and what only you can do

Companion to `audit.md`. Findings are referenced by the IDs from the audit
report (F01–F33).

---

## 1. Before you deploy: five things that are configuration, not code

The code is ready for all of these; none of them can be done from here.

### 1.1 Atlas backups — do this first (F32)

Nothing else on this list matters if a bad migration loses the data.

- Atlas → your cluster → **Backup** → enable scheduled snapshots.
- On the free/shared tier there are no snapshots; either upgrade to M10, or
  add a scheduled `mongodump` to object storage.
- **Then restore once into a scratch cluster.** An untested backup is a
  hypothesis, not a backup.

### 1.2 Upstash Redis — required for rate limiting to be real (F14)

Without it the limiter falls back to an in-process `Map`. Vercel runs many
instances, so that fallback is bypassed simply by being routed elsewhere —
meaning login throttling and AI cost caps effectively do not exist.

1. Create a free Redis database at <https://upstash.com>.
2. Copy the **REST API** URL and token (not the Redis protocol URL).
3. Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in Vercel.

`GET /api/health` reports `rateLimiter.degraded: true` until this is set, and
the boot log warns about it on every deploy.

### 1.3 Resend — required for password reset (F17)

Without a key, reset emails are printed to the server console in development
and **refused outright in production** — deliberately, because silently not
sending a reset email leaves a locked-out user with no way back in.

1. Get a key at <https://resend.com> and verify a sending domain.
2. Set `RESEND_API_KEY` and `EMAIL_FROM` (must use the verified domain).

### 1.4 Google OAuth production config (F19)

This is the one that works locally and fails once deployed.

1. **Both** `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` must exist in the Vercel
   production environment. With one missing, the sign-in button silently does
   not render — for every user, with no error. `src/lib/env.js` now treats a
   half-configured pair as a fatal startup error rather than a warning.
2. In Google Cloud Console → Credentials → your OAuth client, the
   **Authorised redirect URIs** must include your production callback:
   `https://<your-domain>/api/auth/callback/google`
   A missing production URI is the most common cause of Google sign-in dying
   at the callback with a generic error.
3. Set `NEXTAUTH_URL` to your real production origin. A localhost value at
   runtime is now a fatal startup error, because every OAuth callback is built
   from it.

To answer the original question directly: **Google sign-in is available to all
users equally.** It is one module-level boolean (`isGoogleEnabled`), not a
per-user flag — so there is no partial rollout and no user segment excluded.

### 1.5 Run the database maintenance scripts

```bash
npm run db:indexes:check     # preview
npm run db:indexes           # create new indexes, drop superseded ones
npm run db:migrate:paisa:check   # preview
npm run db:migrate:paisa         # float rupees -> integer paisa in the vault
```

Both are idempotent and safe to re-run. Run them against production **after**
1.1 is in place.

---

## 2. What changed in the code

### Performance (the slowness)

| Finding | What was wrong | What it is now |
|---|---|---|
| F01 | Expense list returned **every** matching row and summed them in JS | Paginated (50/page, 200 cap) with totals from a `$group`; `Load older expenses` control |
| F02 | Nothing cached; 13 pages `force-dynamic` | `lib/cache.js` two-tier cache, tag-invalidated on every write |
| F03 | `SIP` had **no index at all**; `Expense` indexes covered half the real query | Compound indexes matching actual query shapes; verified `IXSCAN`, no in-memory sorts, `docsExamined == nReturned` |
| F04 | Portfolio summary was O(transactions × tickers) | One Mongo `$group`; also date-bounded |
| F05 | Readiness endpoint ran 12 queries per request | One 90-day fetch sliced in memory, cached per day |
| F29 | Recharts (>100KB) in the shared bundle | `next/dynamic`; `MiniEvidence` split into its own recharts-free module |
| F30 | `JSON.parse(JSON.stringify())` on every payload | `lib/serialize.js`, one pass, no second copy |

**Measured bundle reduction:** `/app` 248 → 133 kB, `/app/discoveries`
238 → 123 kB, `/app/portfolio` 211 → 112 kB (~47% each).

### Security & auth

- **F17 Password reset** — complete flow. 32-byte token, only its SHA-256 hash
  stored, 30-minute expiry, single-use enforced atomically, neutral response
  for unknown emails, all other tokens burned on use, all sessions revoked.
- **F14 Rate limiting** — every one of 44 routes. Auth 5/15min + per-account
  lockout after 8 failures; signup 3/hour; AI 10/hour and 40/day; writes
  60/min; reads 240/min.
- **F18 Session revocation** — `tokenVersion` on `User`, checked on every
  request. A password change now actually revokes existing sessions; before,
  a stolen JWT stayed valid for up to 30 days after the user "secured" the
  account.
- **F08 ReDoS** — `escapeRegex` shared; the duplicate in
  `features/budget/actions.js` is fixed too (I initially missed it).
- **F09/F13 Middleware** — auth gate, CSP (report-only), HSTS, X-Frame-Options,
  Referrer-Policy, Permissions-Policy, and an explicit cross-origin check.
- **F20 Google linking** — `email_verified` asserted before linking;
  `linkedProviders` records what actually works; a Google-only user typing
  their email now gets "This account signs in with Google" instead of
  "Invalid email or password".
- **F10 Error shape** — one `withRoute()` wrapper. A junk ObjectId is a 404,
  not an unhandled 500, and **zero** routes return raw `err.message`.

### Money correctness

- **F22** — vault moved to integer paisa. Share units are a scaled integer
  (×10⁴) so rounding happens exactly once, at the boundary.
- **F15** — `unitsFor()` returns 0, never `NaN`/`Infinity`, for any input
  combination (proven by an exhaustive test). This is the bug that silently
  poisoned portfolio totals.
- **F23** — idempotency keys on contributions, debt entries and SIP
  installments. A double-tap is now a no-op returning `replayed: true`.
- **F25** — category delete + reassign is transactional, with an
  ordered fallback for deployments without replica sets.

### Operations

- **F31** — `lib/logger.js` with a recursive deny-list (passwords, tokens,
  journal content, amounts, emails — all redacted, proven by test);
  `GET /api/health`; Sentry forwarding wired and inert until installed.
- **F33** — feedback dialog on every screen, route and viewport captured
  automatically.

---

## 3. Two corrections to the audit

Reporting these because the original report was wrong about them:

1. **F24 (SIP "total invested") was inaccurate.** The UI already summed actual
   installments for "Invested to Date" and labelled the schedule projection
   separately as "Projected (by plan)". No misleading figure existed. The code
   was updated for paisa, but there was no bug to fix.

2. **`/api/ai/weekly` does not exist** — it is an empty directory. The audit
   counted five AI endpoints; there are four.

Also: **`cliffsDelta` is O(a×b) but not a bottleneck.** Group sizes are capped
by the 90-day window (~8,100 comparisons, once per hypothesis), so I left the
statistical code alone rather than risk changing results for no gain. The
permutation loop *was* optimised — a per-iteration array allocation removed
using the invariance of the pooled rank total — and a test pins that every
p-value is unchanged.

---

## 4. Deliberately not done

- **F28 subdocument arrays → separate collections.** The full migration is
  post-beta work. Implemented the alternative the plan offered: a hard cap of
  2,000 entries per array, enforced atomically in the same write, with a clear
  message instead of an eventual 16MB document failure. ~5 years of daily
  entries.
- **F26 pattern engine → background queue.** The TTL gate and per-day cap
  already bound it. Needs a queue (QStash/Inngest) to do properly.
- **CSP enforcing mode.** Report-only until the pre-paint theme script in
  `app/layout.js` carries a nonce — switching now would break theming.

---

## 5. Verification performed

```
359 tests passing (19 files) — 122 new
next build — exit 0, no errors
```

Checked against a running server:

| Check | Result |
|---|---|
| `GET /api/health` | 200, DB connected, degradations reported honestly |
| Unauthenticated API call | 401 (middleware) |
| Cross-origin POST | 403 |
| Security headers | all 5 present |
| Invalid signup | 400, `"email: Enter a valid email address. password: Use at least 10 characters."` |
| Signup rate limit | 201, 201, 429, 429, 429 |
| Reset: unknown vs real email | byte-identical responses |
| Reset: token reuse | refused; `used` distinguishable from `expired` |
| Reset: DB side effects | `tokenVersion` 0→1, bcrypt cost 12, token stored as hash, old password rejected |
| Index usage | `IXSCAN`, no in-memory sort, 52 examined / 52 returned |

One bug was found *by* this testing and fixed: inspecting a reset link
originally shared the strict 3/hour send budget, so a user who had requested
two resets could be locked out of using the link they received.

---

## 6. Install (PWA)

selfView installs from the landing page on iPhone, iPad, Android, Mac and
Windows. There is no app store and nothing to submit.

### How each platform installs

There is no single install API, so the button adapts:

| Platform | What happens |
|---|---|
| Android Chrome / Edge / Samsung | Native one-tap prompt |
| Desktop Chrome / Edge | Native prompt, or address-bar icon |
| **iPhone / iPad (any browser)** | Step-by-step Share → Add to Home Screen |
| Android Firefox | Browser-menu instructions |
| macOS Safari 17+ | File → Add to Dock |
| Desktop Firefox | No button — it cannot install web apps |

**iOS is the case that matters.** Safari never fires `beforeinstallprompt`, so
an install button that just calls the prompt does nothing at all on an iPhone.
The dialog detects the platform and shows the real Share-sheet steps instead.
iPadOS is detected via touch points, because iPadOS Safari reports itself as a
Macintosh — without that check every iPad user would be told to use a File menu
their device does not have.

### First-run flow

`start_url` is `/app`, so launching the installed app goes straight to the
dashboard. Someone who installs *before* signing up is redirected to `/login`
by the middleware and signs up there — which is why the install section sits
*before* the sign-up call to action on the landing page. Installing first and
then signing up inside the app is what leaves someone with both.

The middleware now passes `?next=`, and the login form honours it, so launching
the app returns you to the page you were on rather than always the dashboard.

### Offline

A plain `public/offline.html` — inline styles, no JavaScript, no build output.
This was arrived at the hard way: a React offline page needs its JS chunks to
hydrate, and those are not cached unless the user happened to visit that route
while online, so every offline navigation died with *"Application error: a
client-side exception has occurred."* A failed navigation now redirects to
`/offline.html?from=…`, and "Try again" returns to where they were headed.

### Privacy: what the service worker will not cache

Pages under `/app` are server-rendered **with the user's financial data in the
HTML**. The previous service worker cached every navigation, so a user's budget
and journal sat in Cache Storage — readable after sign-out, and on a shared
device readable by the next person. `/app`, `/api` and the auth screens are now
never written to a cache, and signing out wipes the caches outright.

Verified in real headless Chrome against a production build: after visiting
`/login`, `/signup`, `/app` and `/app/budget/expenses`, Cache Storage held only
hashed static chunks, the icons, the offline page, and the public landing page.

### If you change the service worker

Bump `CACHE_VERSION` in `public/sw.js`. Activation deletes every cache that
does not match, which is also how a privately-cached page from an older version
gets purged from devices already in the wild.

### Icons

`icon-192`, `icon-512` and `apple-touch-icon` (180) are present and match their
declared sizes. The 512 has correct maskable safe-zone padding, so Android will
not crop into the mark. Note it is still the **old dark mark** from before the
light "Organic" redesign — worth refreshing at some point, though nothing is
broken.

---

## 7. Admin console (`/sysadmin`)

### Signing in

Seeded with `npm run seed:superadmin`. Sign in at `/login` as normal, then
open `/sysadmin` — there is no separate admin login, because a second set of
credentials would be a second thing to compromise.

> **The seeded password is committed to this repository, so it is not a
> secret.** Anyone with the repo has it. Change it from the profile screen
> after your first sign-in, or re-seed with `SUPERADMIN_PASSWORD` set in the
> environment. The script never silently resets a password you have already
> changed — `--reset-password` opts into that explicitly.

### Roles

| Role | Can do |
|---|---|
| `user` | Their own data. Cannot open `/sysadmin` at all. |
| `admin` | Dashboard, feature usage, suspend/restore ordinary users. |
| `superadmin` | All of the above, plus granting and revoking admin. |

One rule does most of the work: **you can only act on someone strictly below
you.** That single comparison stops an admin demoting a superadmin, stops
admins acting on each other, and — since equal rank is not strictly below —
stops anyone acting on themselves. The last one matters: without it the only
superadmin could demote themselves and lock everyone out permanently.
Granting a role at or above your own is refused for the same reason.

Roles are re-read from the database on **every** request, not taken from the
session token. Revoking someone's admin therefore takes effect immediately; if
it lived in the JWT it would persist until the token expired — up to 30 days.

### Dashboard

- **People** — total, active today/week/month, new this week/month, and
  *never signed in* (the sharpest onboarding signal there is), plus a 30-day
  signup strip.
- **Feature usage** — for each feature: adoption (share of users with at least
  one record), depth (records per adopting user), and recent activity. Split
  into **most used**, **untouched** (not one record from anyone), and **gone
  quiet** (tried, then abandoned — usually the more interesting problem).

**How it is measured, and the honest limitation:** every figure is derived by
counting records the app already stores. No tracking pixel, no third party,
nothing extra written on page view — and it is retroactive, describing the
whole history rather than the period since tracking was added. What it cannot
see is *reading*: someone who opens their briefing weekly but never writes a
journal entry shows as not using the journal. For deciding what to build,
creation is the sturdier signal, but it is not the whole picture. This is
stated on the page itself too.

Seeded default categories are excluded from the count — including them would
report 100% adoption of something nobody chose.

### Suspension

Blocks sign-in (credentials *and* Google) and ends any session already held,
while keeping all of the account's data. Deleting someone's financial history
to stop them misbehaving is a wildly disproportionate response.

Suspension is checked **after** the password is verified, deliberately: the
other order let anyone discover that an address has a suspended account just
by submitting it with any password.

### Not built

No admin view of user *content*. Counts of what someone created, yes; their
journal entries and expense notes, no. Supporting a user needs the former; the
latter is just reading their diary.

---

## 8. Suggested first beta week

1. Watch `GET /api/health` on an uptime monitor (5-minute interval).
2. Install Sentry — `npm i @sentry/nextjs` — the logger already forwards to it.
3. Read `/api/feedback` daily. It is the reason to run a beta.
4. Watch for `[env]` warnings in the deploy log; each one names a disabled
   feature.
