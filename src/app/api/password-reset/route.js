import bcrypt from "bcryptjs";
import { withRoute, json, badRequest } from "@/lib/api";
import { z, email as emailSchema, password as passwordSchema } from "@/lib/validation";
import { clientIp } from "@/lib/rate-limit";
import { sendEmail, passwordResetEmail } from "@/lib/mailer";
import { log } from "@/lib/logger";
import { revokeSessions } from "@/lib/auth";
import User from "@/models/User";
import {
  RESET_EXPIRY_MINUTES,
  claimResetToken,
  inspectResetToken,
  invalidateUserTokens,
  issueResetToken,
} from "@/features/auth/reset-service";

/**
 * The response every request to this endpoint gets, whether or not the
 * email exists. Identical body, identical status, and — because the work
 * done differs — a deliberate note that timing is not defended here beyond
 * the rate limit.
 */
const NEUTRAL = {
  ok: true,
  message:
    "If an account exists for that email, a reset link is on its way. Check your inbox and spam folder.",
};

/** Absolute origin for the link in the email. */
function resolveOrigin(request) {
  const configured = process.env.NEXTAUTH_URL || process.env.AUTH_URL;
  if (configured) return configured.replace(/\/$/, "");
  const host = request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}

/**
 * POST /api/password-reset — request a reset link.
 *
 * Rate limited per IP *and* per email address: the per-IP limit stops one
 * machine enumerating many addresses, the per-email limit stops many
 * machines mailbombing one person.
 *
 * Body: { email }
 */
export const POST = withRoute(
  {
    auth: false,
    limit: "passwordReset",
    body: z.object({ email: emailSchema }),
  },
  async ({ input, request }) => {
    const issued = await issueResetToken(input.email, { ip: clientIp(request) });

    // No account, or a Google-only account. Respond exactly as if a mail
    // had been sent — this is the whole point of the neutral response.
    if (!issued) {
      log.info("Password reset requested for unresettable address");
      return json(NEUTRAL);
    }

    const url = `${resolveOrigin(request)}/reset-password?token=${encodeURIComponent(issued.token)}`;

    try {
      await sendEmail(
        passwordResetEmail({
          to: issued.user.email,
          name: issued.user.name,
          url,
          expiryMinutes: RESET_EXPIRY_MINUTES,
        })
      );
    } catch (err) {
      // A delivery failure must not be reported as success — the user would
      // sit waiting for an email that is never coming. This is the one case
      // where the response differs, and it reveals nothing about the
      // account, only about our mail provider.
      log.error("Password reset email failed to send", { message: err.message });
      throw badRequest(
        "We could not send the reset email just now. Please try again in a few minutes."
      );
    }

    log.info("Password reset email sent", { userId: String(issued.user._id) });
    return json(NEUTRAL);
  }
);

/**
 * GET /api/password-reset?token=… — is this link still good?
 *
 * Lets the reset page render "this link has expired" before asking someone
 * to type a new password twice for nothing.
 */
export const GET = withRoute(
  {
    auth: false,
    // Not the send limit: checking a link must not consume the budget for
    // requesting one. See the note on `passwordResetToken` in rate-limit.js.
    limit: "passwordResetToken",
    query: z.object({ token: z.string().min(1, "That reset link is missing its token.").max(200) }),
  },
  async ({ query }) => {
    const result = await inspectResetToken(query.token);
    return json(result);
  }
);

/**
 * PUT /api/password-reset — consume the token and set the password.
 *
 * On success: the token is burned, every *other* outstanding token for the
 * account is burned with it, the lockout counter is cleared, and all
 * existing sessions are revoked. That last one matters — resetting a
 * password because you think someone is in your account has to actually
 * remove them.
 *
 * Body: { token, password }
 */
export const PUT = withRoute(
  {
    auth: false,
    // Same reasoning as GET — a user who mistypes their new password twice
    // must still be able to complete the reset they were sent.
    limit: "passwordResetToken",
    body: z.object({
      // Explicit message: zod's default ("Too small: expected string to have
      // >=1 characters") is internal phrasing, not something to show a user.
      token: z.string().min(1, "That reset link is missing its token.").max(200),
      password: passwordSchema,
    }),
  },
  async ({ input }) => {
    const claimed = await claimResetToken(input.token);
    if (!claimed) {
      throw badRequest(
        "That reset link is invalid or has expired. Request a new one and try again."
      );
    }

    const passwordHash = await bcrypt.hash(input.password, 12);

    await User.updateOne(
      { _id: claimed.userId },
      {
        $set: {
          passwordHash,
          failedLoginCount: 0,
          lockedUntil: null,
        },
        // Credentials now work for this account even if it began as Google.
        $addToSet: { linkedProviders: "credentials" },
      }
    );

    await invalidateUserTokens(claimed.userId);
    await revokeSessions(claimed.userId);

    log.info("Password reset completed", { userId: claimed.userId });

    return json({
      ok: true,
      message: "Your password has been changed. You can sign in with it now.",
    });
  }
);
