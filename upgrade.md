Product context (do not reinvent)
SelfView is a Nepal-oriented personal OS: Wealth (expenses/income), Habits, Journal + mood, weekly AI briefing, privacy-first. Monetization (already decided): Free = logging/habits/journal (limited history); Pro = AI briefing, NEPSE, exports, statement import (treat import as Pro-gated unless Free already allows uploads — if unclear, gate full import behind Pro, allow voice quick-add on Free).

Goals (implement all)
Password reset via email OTP/code
Lean APIs — responses and request bodies send only necessary fields
User feedback — users submit; admins see feedback in an admin section
Voice-based expense (and optionally income) entry
Bank statement import — especially Citizen Bank (CTZN) electronic account statement PDF (sample provided); detect bank, parse rows, preview, confirm, save to Wealth with dedupe
1) Password reset email + code
Behavior
User requests reset with email (or username if that’s how auth works today).
Server generates a short numeric/alphanumeric code (prefer 6-digit OTP) with expiry (e.g. 10–15 minutes) and limited attempts.
Email the code (and optional deep link). Do not put raw passwords in email.
User submits email + code + new password → verify → update password hash → invalidate code.
Clear UX: “code sent”, “invalid/expired code”, rate-limit resends (e.g. 60s cooldown, max N/hour).
Implementation requirements
Reuse existing auth stack (email/password + Google if present). Add forgot-password + reset-password routes/pages if missing (earlier review noted no forgot-password link).
Store hashed or one-way token for the OTP (or store OTP hashed); never log OTP in plain text in production logs.
Email via whatever the project already uses, or add a minimal provider (Resend/Nodemailer/SMTP) behind env vars: EMAIL_FROM, provider API key. Document env vars.
API payloads: request/response only { email } / { ok: true } on request-reset (don’t reveal whether email exists — same message either way for security). Reset confirm: { email, code, newPassword } → { ok: true } or error code.
Out of scope
SMS OTP (unless already wired). Email only for this task.
2) Lean APIs (“send only necessary things”)
Rules for all new and touched endpoints
Never return full Mongo documents, password hashes, Google tokens, internal __v, or unused nested blobs.
Prefer explicit DTOs / .select() / Zod response schemas.
List endpoints: pagination { items, nextCursor } or { items, total } — only fields the UI needs.
Admin endpoints: still minimal; don’t dump entire user profiles when listing feedback.
Audit existing Wealth / Journal / Habits / Auth /api/* handlers you touch in this work and strip over-fetching.
Examples
Expense list item: id, amount, currency, type, category, note, date, source, createdAt — not full user object.
Feedback list (admin): id, message, type?, email?, userId?, createdAt, status — not full user doc.
3) Feedback → Admin section
User side
Simple “Send feedback” UI (settings or footer): message (required), optional type (bug/idea/other), optional contact email if logged out.
Authenticated: attach userId server-side; don’t trust client userId.
Admin side
Admin-only section (protect with existing admin role/flag or ADMIN_EMAILS env allowlist — match project convention; if none exists, add role: 'admin' | 'user' or env allowlist and document it).
List feedback newest-first; filter by status (new / read / archived); mark read; optional reply notes internal-only.
API:
POST /api/feedback — body { message, type? } only.
GET /api/admin/feedback — admin only; lean list.
PATCH /api/admin/feedback/:id — { status } only.
4) Voice-based expense entry
UX
On Wealth “add expense/income”: microphone button.
Flow: tap mic → record/listen → STT transcript → parse → confirm chip/sheet (amount, type withdraw/deposit or expense/income, category, note, date=now) → user confirms → save.
Never save without confirm (bad transcripts).
Parsing
Support English first: e.g. “spent 500 on momo”, “income salary 35000”.
Best-effort Nepali/Nepenglish amounts later (“dui saya”, “five thousand”) — degrade gracefully.
Output structured: { amount: number, type: 'expense'|'income', category?: string, note?: string }.
Tech
Prefer reusing Groq (already in product) for Whisper STT and/or LLM extraction.
Fallback: browser webkitSpeechRecognition for English-only when API unavailable.
Mobile/PWA: ensure mic permission messaging.
Gate: Free OK for voice quick-add (habit); if cost is high, limit free voice parses/day.
API
Option A (recommended): client sends audio or transcript to POST /api/wealth/parse-voice with { transcript } or multipart audio → returns only parsed fields + transcript for confirm UI. Persist only after separate existing create-expense API.
Do not mix parse + save in one call without confirm.
5) Statement import — Citizen Bank PDF (and extensible)
Product flow
User uploads PDF (and later CSV/XLS).
Detect bank / format (citizen / unknown).
Parse transactions; show preview table with mapping: date, description, withdraw, deposit, balance, suggested category, include toggle.
User confirms → create Wealth entries; dedupe by fingerprint (date + amount + normalized description + direction).
Opening/Closing balance rows are not expenses — skip or show as info only.
Mark source: source: 'import:citizen-bank' (or similar) for analytics.
Pro gate
Full import = Pro (unless product already decided otherwise). Soft paywall with clear upgrade CTA.
Citizen Bank electronic statement — format contract (from real sample)
PDF title: “Electronic Account Statement” (JasperReports / iText).

Header fields (parse for display, don’t require all to succeed):

Account Holder's Name
Account Number
From Date / To Date (YYYY-MM-DD)
Currency Code (NPR)
Opening Balance / Closing Balance
Account Interest Rate / Accrued Interest (optional, ignore for Wealth)
Table columns (in order): S.N | Transaction Date | Description | Withdraw | Deposit | Balance

Row rules:

Opening Balance / Closing Balance rows: no S.N expense; skip for transaction import.
Real txns have S.N numbers; Transaction Date often YYYY-MM-DD HH:mm:ss.
Withdraw column → expense / money out (type: 'expense' or existing debit field).
Deposit column → income / money in.
Amounts use comma thousands: 5,000.00, 35,350.00 — strip commas → number.
Empty side shown as -.
Description is multi-line in PDF text extraction (wrapped). Join continuation lines until next S.N / next datetime / Closing Balance.
Common description patterns to categorize (heuristics, editable in preview):
ESEWA / esewa → category Wallet/Transfers or Bills
NT Prepaid / topup → Mobile/Recharge
FT to + account → Transfer
SALARY → Income / Salary
MB/... prefix = mobile banking — keep in note/raw description
Parsing strategy:

Try text extraction (pdf-parse / unpdf / similar) first.
Detect Citizen via header string Electronic Account Statement + fields like Account Holder's Name / currency NPR layout.
Regex/state-machine over lines: capture header; then rows starting with date or S.N.
Validate: running balance optional check; warn in UI if parse confidence low.
If text extract fails (rotated/weird PDF — sample may be landscape/rotated), fall back to OCR path or clear error “could not read this PDF”.
API (lean):

POST /api/wealth/imports/parse — multipart file → { bank, fromDate, toDate, openingBalance, closingBalance, transactions: [{ date, description, withdraw, deposit, balance, suggestedCategory, fingerprint }] } — no file bytes in response.
POST /api/wealth/imports/commit — { transactions: [{ ...selected fields }] } → { created: number, skippedDuplicates: number }.
Extensibility: structure parser as parsers/citizenBank.ts + registry so eSewa/Khalti Excel can be added later without rewrite.

Privacy
Don’t store original PDF long-term unless user opts in; prefer parse → keep transactions only. If temporary storage needed, expire quickly.
Never log full account numbers in plaintext logs (mask middle digits).
6) Acceptance criteria
 Forgot password → email code → reset works end-to-end with env-based email.
 Reset APIs do not leak whether an email is registered.
 New/changed APIs return only necessary fields (spot-check auth, wealth, feedback, admin).
 Users can submit feedback; admins can list/filter/mark status in an admin UI.
 Voice: mic → transcript → parsed preview → confirm → Wealth entry saved.
 Citizen Bank PDF like the provided sample: detects bank, lists withdraw/deposit rows correctly, skips opening/closing, dedupes on re-import, categories are suggested but editable.
 Import respects Pro (or documented) gating.
 No regressions to existing login (Google + email/password).
7) Implementation order
Lean response helpers / DTO pattern (small, reusable).
Password reset email OTP.
Feedback + admin section.
Voice parse + confirm on Wealth.
Citizen Bank PDF import (parse → preview → commit) + Pro gate.
8) Non-goals
Live eSewa/Khalti/bank auto-sync of personal spends (not available via public merchant APIs in Nepal).
Building a new app or changing Free/Pro pricing copy beyond gating import.
SMS OTP, full accounting/IRD features.
9) Deliverables expected from the coding agent
Working code in the existing repo.
Short notes: env vars added, how to test reset email, how to test Citizen PDF with the sample statement.
Keep UI consistent with current dark theme / SelfView design language.