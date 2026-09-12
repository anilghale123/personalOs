/**
 * Transactional email over the Resend REST API.
 *
 * `fetch` rather than the SDK, for the same reason the rate limiter talks
 * to Upstash over REST: one less dependency, and nothing here needs more
 * than a POST.
 *
 * Without `RESEND_API_KEY` the message is logged instead of sent, so the
 * password-reset flow is fully testable locally without an email provider.
 * That fallback is explicitly refused in production — silently not sending
 * a reset email is the worst possible outcome for a locked-out user.
 */

import { log } from "@/lib/logger";

const RESEND_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM || "SelfVue <onboarding@resend.dev>";

/** True when real email delivery is configured. */
export const canSendEmail = Boolean(RESEND_KEY);

/**
 * Send one email.
 * @param {{to: string, subject: string, html: string, text: string}} message
 * @returns {Promise<{sent: boolean, logged?: boolean}>}
 */
export async function sendEmail({ to, subject, html, text }) {
  if (!canSendEmail) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "RESEND_API_KEY is not configured — cannot send transactional email."
      );
    }
    // Dev: print the link so the flow is walkable without a provider. The
    // body is printed deliberately here, which is why this branch can
    // never run in production.
    log.warn("Email not sent (no RESEND_API_KEY) — logging instead", {
      to,
      subject,
    });
    console.log(`\n──── dev email ────\nTo: ${to}\nSubject: ${subject}\n\n${text}\n───────────────────\n`);
    return { sent: false, logged: true };
  }

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
    // Include the provider status but never the recipient in the thrown
    // message — it propagates into logs and error trackers.
    const detail = await res.text().catch(() => "");
    throw new Error(`Email provider returned ${res.status}: ${detail.slice(0, 200)}`);
  }

  return { sent: true };
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
 * The password reset email.
 *
 * Deliberately plain: no tracking pixels, no images, one link. The expiry
 * is stated because a reset link that has quietly gone stale is a support
 * request waiting to happen.
 *
 * @param {{to: string, name?: string, url: string, expiryMinutes: number}} opts
 */
export function passwordResetEmail({ to, name, url, expiryMinutes }) {
  const greeting = name ? `Hi ${esc(name)},` : "Hi,";
  const safeUrl = esc(url);

  const text = [
    greeting,
    "",
    "You asked to reset your SelfVue password. Open this link to choose a new one:",
    "",
    url,
    "",
    `The link works once and expires in ${expiryMinutes} minutes.`,
    "",
    "If you didn't ask for this, you can ignore this email — your password has not changed.",
    "",
    "— SelfVue",
  ].join("\n");

  const html = `<!doctype html>
<html><body style="margin:0;background:#f6f7f5;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#14181a">
  <table role="presentation" style="max-width:480px;margin:0 auto;background:#fff;border-radius:8px;border:1px solid #dce1dc">
    <tr><td style="padding:32px">
      <p style="margin:0 0 16px;font-size:15px">${greeting}</p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.6">
        You asked to reset your SelfVue password. Choose a new one here:
      </p>
      <p style="margin:0 0 24px">
        <a href="${safeUrl}" style="display:inline-block;background:#1f5f5b;color:#fff;text-decoration:none;padding:11px 20px;border-radius:5px;font-size:15px;font-weight:500">Choose a new password</a>
      </p>
      <p style="margin:0 0 24px;font-size:13px;color:#5f6a6c;line-height:1.6">
        The link works once and expires in ${expiryMinutes} minutes.
      </p>
      <p style="margin:0;padding-top:20px;border-top:1px solid #e9ede8;font-size:13px;color:#5f6a6c;line-height:1.6">
        If you didn't ask for this, ignore this email — your password has not changed.
      </p>
    </td></tr>
  </table>
</body></html>`;

  return { to, subject: "Reset your SelfVue password", html, text };
}
