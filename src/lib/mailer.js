/**
 * Transactional email.
 *
 * Two providers behind one function, chosen by environment:
 *
 *   1. **SMTP** (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`,
 *      `SMTP_FROM`) via nodemailer — works with Gmail app passwords, Zoho,
 *      Brevo, SES SMTP, or any mailbox provider.
 *   2. **Resend** (`RESEND_API_KEY`, `EMAIL_FROM`) over its REST API.
 *
 * SMTP wins when both are set. With neither, the message is printed to the
 * server console in development so the reset flow is walkable locally. That
 * fallback is refused in production — silently not sending a reset email is
 * the worst possible outcome for a locked-out user.
 */

import { log } from "@/lib/logger";

const SMTP_HOST = process.env.SMTP_HOST?.trim();
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_USER = process.env.SMTP_USER?.trim();
const SMTP_PASS = process.env.SMTP_PASS;
const RESEND_KEY = process.env.RESEND_API_KEY?.trim();
const FROM =
  process.env.SMTP_FROM?.trim() ||
  process.env.EMAIL_FROM?.trim() ||
  "SelfView <onboarding@resend.dev>";

/** Which provider is configured, if any. */
export const emailProvider = SMTP_HOST ? "smtp" : RESEND_KEY ? "resend" : null;

/** True when real email delivery is configured. */
export const canSendEmail = Boolean(emailProvider);

/** One pooled transport per server instance. */
let transportPromise;

function getTransport() {
  if (!transportPromise) {
    transportPromise = import("nodemailer").then(({ default: nodemailer }) =>
      nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        // 465 is implicit TLS; everything else (587, 25, 2525) upgrades via
        // STARTTLS, which nodemailer negotiates on its own.
        secure: SMTP_PORT === 465,
        auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
        // Fail inside the request budget instead of hanging a serverless
        // function until the platform kills it.
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 15_000,
      })
    );
  }
  return transportPromise;
}

async function sendViaSmtp({ to, subject, html, text }) {
  const transport = await getTransport();
  await transport.sendMail({ from: FROM, to, subject, html, text });
}

async function sendViaResend({ to, subject, html, text }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM, to: [to], subject, html, text }),
    cache: "no-store",
  });

  if (!res.ok) {
    // Provider status only — never the recipient, which would propagate
    // into logs and error trackers.
    const detail = await res.text().catch(() => "");
    throw new Error(`Email provider returned ${res.status}: ${detail.slice(0, 200)}`);
  }
}

/**
 * Send one email.
 * @param {{to: string, subject: string, html: string, text: string}} message
 * @returns {Promise<{sent: boolean, logged?: boolean}>}
 */
export async function sendEmail(message) {
  if (emailProvider === "smtp") {
    try {
      await sendViaSmtp(message);
    } catch (err) {
      // nodemailer errors can echo the envelope; keep only the SMTP code.
      throw new Error(
        `SMTP delivery failed${err?.responseCode ? ` (${err.responseCode})` : ""}: ${
          err?.code || "error"
        }`
      );
    }
    return { sent: true };
  }

  if (emailProvider === "resend") {
    await sendViaResend(message);
    return { sent: true };
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "No email provider configured (set SMTP_HOST… or RESEND_API_KEY) — cannot send transactional email."
    );
  }

  // Dev only: print the message so the flow is walkable without a provider.
  // The body is printed deliberately, which is why this can never run in
  // production.
  log.warn("Email not sent (no SMTP/Resend configured) — logging instead", {
    subject: message.subject,
  });
  console.log(
    `\n──── dev email ────\nTo: ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n───────────────────\n`
  );
  return { sent: false, logged: true };
}

/** Escape a value for interpolation into an HTML email body. */
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

/**
 * The password reset email: a one-time code, no link to phish with.
 *
 * Deliberately plain — no tracking pixels, no images. The expiry is stated
 * because a code that has quietly gone stale is a support request waiting to
 * happen.
 *
 * @param {{to: string, name?: string, code: string, expiryMinutes: number}} opts
 */
export function passwordResetCodeEmail({ to, name, code, expiryMinutes }) {
  const greeting = name ? `Hi ${esc(name)},` : "Hi,";
  const safeCode = esc(code);

  const text = [
    greeting,
    "",
    "Use this code to reset your SelfView password:",
    "",
    `    ${code}`,
    "",
    `It expires in ${expiryMinutes} minutes and works once.`,
    "",
    "If you didn't ask for this, you can ignore this email — your password has not changed. Never share this code with anyone.",
    "",
    "— SelfView",
  ].join("\n");

  const html = `<!doctype html>
<html><body style="margin:0;background:#f6f7f5;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#14181a">
  <table role="presentation" style="max-width:480px;margin:0 auto;background:#fff;border-radius:8px;border:1px solid #dce1dc">
    <tr><td style="padding:32px">
      <p style="margin:0 0 16px;font-size:15px">${greeting}</p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.6">
        Use this code to reset your SelfView password:
      </p>
      <p style="margin:0 0 20px;font-size:32px;font-weight:600;letter-spacing:8px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#1f5f5b">${safeCode}</p>
      <p style="margin:0 0 24px;font-size:13px;color:#5f6a6c;line-height:1.6">
        It expires in ${expiryMinutes} minutes and works once.
      </p>
      <p style="margin:0;padding-top:20px;border-top:1px solid #e9ede8;font-size:13px;color:#5f6a6c;line-height:1.6">
        If you didn't ask for this, ignore this email — your password has not changed. Never share this code with anyone.
      </p>
    </td></tr>
  </table>
</body></html>`;

  return { to, subject: `${code} is your SelfView reset code`, html, text };
}
