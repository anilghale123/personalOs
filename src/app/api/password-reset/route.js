import bcrypt from "bcryptjs";
import { withRoute, json, badRequest, tooMany, ApiError } from "@/lib/api";
import { z, email as emailSchema, password as passwordSchema } from "@/lib/validation";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { sendEmail, passwordResetCodeEmail } from "@/lib/mailer";
import { log } from "@/lib/logger";
import { revokeSessions } from "@/lib/auth";
import User from "@/models/User";
import {
  CODE_LENGTH,
  RESET_EXPIRY_MINUTES,
  consumeResetCode,
  invalidateUserCodes,
  issueResetCode,
} from "@/features/auth/reset-service";

/**
 * POST /api/password-reset — email a 6-digit reset code.
 *
 * Body: { email }  →  { ok: true }
 *
 * The response is identical whether or not the account exists, and whether
 * or not a code was actually sent (the per-account cooldown also answers
 * `{ ok: true }`). Rate limited per IP by `withRoute` and per address here:
 * the first stops one machine enumerating many addresses, the second stops
 * many machines mailbombing one person.
 */
export const POST = withRoute(
  {
    auth: false,
    limit: "passwordReset",
    body: z.object({ email: emailSchema }),
  },
  async ({ input, request }) => {
    const perEmail = await rateLimit(input.email, "passwordReset", "email");
    if (!perEmail.allowed) {
      // Applies to any address, registered or not, so it leaks nothing.
      throw tooMany(
        "Too many codes requested for this email. Please wait a while and try again.",
        perEmail.retryAfterSec
      );
    }

    const issued = await issueResetCode(input.email, { ip: clientIp(request) });
    if (!issued) return json({ ok: true });

    try {
      await sendEmail(
        passwordResetCodeEmail({
          to: issued.user.email,
          name: issued.user.name,
          code: issued.code,
          expiryMinutes: RESET_EXPIRY_MINUTES,
        })
      );
    } catch (err) {
      // A delivery failure must not be reported as success — the user would
      // wait for an email that is never coming. Burn the unsent code so a
      // retry is not blocked by the cooldown's "one live code" rule.
      await invalidateUserCodes(issued.user._id);
      log.error("Password reset email failed to send", { message: err.message });
      throw badRequest(
        "We could not send the reset email just now. Please try again in a few minutes."
      );
    }

    log.info("Password reset code sent", { userId: String(issued.user._id) });
    return json({ ok: true });
  }
);

/**
 * PUT /api/password-reset — verify the code and set the new password.
 *
 * Body: { email, code, newPassword }  →  { ok: true }
 * Failure: 400 `{ error, code: "invalid_code" }` for every kind of bad code
 * (wrong, expired, used, too many attempts, unknown email) — one answer, so
 * it reveals nothing about the account.
 *
 * On success the code is burned, the lockout counter cleared, and every
 * existing session revoked: resetting because you think someone is in your
 * account has to actually remove them.
 */
export const PUT = withRoute(
  {
    auth: false,
    // Not the send limit — someone who mistypes a code must still be able to
    // finish. Guessing is bounded per code in reset-service, not here.
    limit: "passwordResetToken",
    body: z.object({
      email: emailSchema,
      code: z
        .string()
        .trim()
        .regex(new RegExp(`^\\d{${CODE_LENGTH}}$`), `Enter the ${CODE_LENGTH}-digit code from the email.`),
      newPassword: passwordSchema,
    }),
  },
  async ({ input }) => {
    const claimed = await consumeResetCode(input.email, input.code);
    if (!claimed) {
      throw new ApiError(
        400,
        "That code is invalid or has expired. Check the latest email or request a new code.",
        "invalid_code"
      );
    }

    const passwordHash = await bcrypt.hash(input.newPassword, 12);

    await User.updateOne(
      { _id: claimed.userId },
      {
        $set: { passwordHash, failedLoginCount: 0, lockedUntil: null },
        $addToSet: { linkedProviders: "credentials" },
      }
    );

    await invalidateUserCodes(claimed.userId);
    await revokeSessions(claimed.userId);

    log.info("Password reset completed", { userId: claimed.userId });
    return json({ ok: true });
  }
);
