import bcrypt from "bcryptjs";
import { withRoute, json, badRequest, must } from "@/lib/api";
import { z, password as passwordSchema } from "@/lib/validation";
import { revokeSessions } from "@/lib/auth";
import { log } from "@/lib/logger";
import User from "@/models/User";
import { invalidateUserTokens } from "@/features/auth/reset-service";

const BCRYPT_ROUNDS = 12;

const ChangePasswordBody = z.object({
  currentPassword: z.string().max(200).optional(),
  newPassword: passwordSchema,
});

/**
 * PATCH /api/profile/password — change (or set) the account password.
 *
 * Passwords are stored as one-way bcrypt hashes, so an existing password
 * can never be "revealed" — only replaced. Accounts that signed up with
 * Google have no password yet, so `currentPassword` is only required when
 * one already exists; otherwise this sets the first one, letting a
 * Google-only account add credentials login as a backup.
 *
 * Changing a password now actually revokes access: every existing session
 * is invalidated, and any outstanding reset links are burned. Previously a
 * stolen JWT stayed valid for the full 30-day window after the user
 * "secured" their account, which made this endpoint feel like a security
 * control while being none.
 *
 * Body: { currentPassword?, newPassword }
 */
export const PATCH = withRoute(
  { limit: "auth", body: ChangePasswordBody },
  async ({ userId, input }) => {
    const user = must(
      await User.findById(userId).select("passwordHash email")
    );

    if (user.passwordHash) {
      if (!input.currentPassword) {
        throw badRequest("Enter your current password to change it.");
      }
      const valid = await bcrypt.compare(
        input.currentPassword,
        user.passwordHash
      );
      if (!valid) throw badRequest("Current password is incorrect.");

      // Rejecting a no-op change is kinder than silently accepting it —
      // the user thinks something happened when nothing did.
      const same = await bcrypt.compare(input.newPassword, user.passwordHash);
      if (same) {
        throw badRequest("That's already your current password. Choose a different one.");
      }
    }

    await User.updateOne(
      { _id: userId },
      {
        $set: {
          passwordHash: await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS),
          failedLoginCount: 0,
          lockedUntil: null,
        },
        $addToSet: { linkedProviders: "credentials" },
      }
    );

    await invalidateUserTokens(userId);
    await revokeSessions(userId);

    log.info("Password changed", { userId });

    return json({
      ok: true,
      // The client needs to know the current session is now dead so it can
      // send the user back to sign in rather than failing mysteriously on
      // the next request.
      sessionsRevoked: true,
      message: "Password updated. Please sign in again with your new password.",
    });
  }
);
