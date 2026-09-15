import { withRoute, json, must } from "@/lib/api";
import { z, text } from "@/lib/validation";
import { invalidate, invalidateMoney, tags } from "@/lib/cache";
import User from "@/models/User";
import { isProUser } from "@/lib/plans";

/** The client-safe shape of a profile. Never includes the password hash. */
function toProfile(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    image: user.image,
    provider: user.provider,
    /**
     * Which providers actually work for this account. `provider` alone only
     * records how it was created, so a credentials account later linked to
     * Google kept reporting "credentials" — and the profile screen could not
     * tell the user how they sign in.
     */
    linkedProviders: user.linkedProviders?.length
      ? user.linkedProviders
      : // Inferred for accounts predating the field.
        [user.passwordHash ? "credentials" : "google"],
    hasPassword: Boolean(user.passwordHash),
    // Absent on accounts created before the preference existed, which
    // reads correctly as "off".
    journalExtraction: Boolean(user.preferences?.journalExtraction),
    // Same story — absent reads as the English calendar.
    dateFormat: user.preferences?.dateFormat === "nepali" ? "nepali" : "english",
    // Effective plan (admins and PRO_EMAILS count as Pro), not the raw field.
    plan: isProUser(user) ? "pro" : "free",
  };
}

/** GET /api/profile — the current user's profile details. */
export const GET = withRoute({ limit: "read" }, async ({ userId }) => {
  const user = must(
    await User.findById(userId)
      .select("name email image provider linkedProviders passwordHash preferences plan role")
      .lean()
  );
  return json(toProfile(user));
});

const UpdateProfile = z
  .object({
    name: text(80).pipe(z.string().min(1, "Name cannot be empty.")).optional(),
    journalExtraction: z.boolean().optional(),
    dateFormat: z.enum(["english", "nepali"]).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "Nothing to update.",
  });

/**
 * PATCH /api/profile — update display name and/or preferences.
 * Body: { name?, journalExtraction?, dateFormat? }
 */
export const PATCH = withRoute(
  { limit: "write", body: UpdateProfile },
  async ({ userId, input }) => {
    const update = {};
    if (input.name !== undefined) update.name = input.name;
    // Turning journal analysis off stops all future extraction immediately;
    // the route that performs it checks this on every call.
    if (input.journalExtraction !== undefined) {
      update["preferences.journalExtraction"] = input.journalExtraction;
    }
    if (input.dateFormat !== undefined) {
      update["preferences.dateFormat"] = input.dateFormat;
    }

    const user = must(
      await User.findByIdAndUpdate(
        userId,
        { $set: update },
        { new: true, runValidators: true }
      )
        .select("name email image provider linkedProviders passwordHash preferences plan role")
        .lean()
    );

    invalidate(tags.profile(userId));
    // The calendar preference decides which window every money screen groups
    // by, so a change to it invalidates every cached summary — otherwise the
    // user switches to Bikram Sambat and sees Gregorian totals.
    if (input.dateFormat !== undefined) invalidateMoney(userId);

    return json(toProfile(user));
  }
);
