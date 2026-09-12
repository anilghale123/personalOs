import bcrypt from "bcryptjs";
import { withRoute, json, conflict } from "@/lib/api";
import { z, email, password, text } from "@/lib/validation";
import { log } from "@/lib/logger";
import User from "@/models/User";

/** bcrypt work factor. 12 ≈ 250ms on current hardware — slow enough to
 *  matter to an attacker, fast enough not to be felt at a login. */
const BCRYPT_ROUNDS = 12;

const RegisterBody = z.object({
  name: text(80).pipe(z.string().min(1, "Tell us your name.")),
  email,
  password,
});

/**
 * POST /api/register — create an account.
 *
 * Rate limited per IP: without it, unlimited account creation was possible,
 * and the 409 below made the endpoint a membership oracle at any speed.
 *
 * The 409 is deliberately kept. It does disclose that an email is
 * registered, but for a known beta cohort the UX of "you already have an
 * account" beats the ambiguity of a generic error, and the rate limit
 * removes the ability to enumerate at scale. The reset endpoint, where the
 * same disclosure would be genuinely dangerous, responds neutrally instead.
 *
 * Body: { name, email, password }
 */
export const POST = withRoute(
  { auth: false, limit: "signup", body: RegisterBody },
  async ({ input }) => {
    const existing = await User.findOne({ email: input.email })
      .select("_id")
      .lean();
    if (existing) {
      throw conflict("An account with this email already exists.");
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

    const user = await User.create({
      name: input.name,
      email: input.email,
      passwordHash,
      provider: "credentials",
      linkedProviders: ["credentials"],
    });

    log.info("Account created", { userId: String(user._id) });

    // Never return the hash, and nothing else about the account is useful
    // to the client here — it has to sign in next regardless.
    return json(
      { id: user._id.toString(), email: user.email, name: user.name },
      { status: 201 }
    );
  }
);
