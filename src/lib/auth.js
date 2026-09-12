import NextAuth from "next-auth";
import { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import connectDB from "@/lib/mongoose";
import User from "@/models/User";
import { log } from "@/lib/logger";
import { SIGNIN_ERRORS } from "@/features/auth/signin-errors";

const GOOGLE_ID = process.env.AUTH_GOOGLE_ID || process.env.GOOGLE_CLIENT_ID;
const GOOGLE_SECRET =
  process.env.AUTH_GOOGLE_SECRET || process.env.GOOGLE_CLIENT_SECRET;

/** True when Google OAuth credentials are configured. */
export const isGoogleEnabled = Boolean(GOOGLE_ID && GOOGLE_SECRET);

/** Failed attempts before an account is temporarily locked. */
export const MAX_FAILED_LOGINS = 8;
/** How long a locked account stays locked. */
export const LOCKOUT_MINUTES = 15;
/** Sessions expire after this long regardless of activity. */
const SESSION_MAX_AGE_DAYS = 30;

// Re-exported for server callers; defined in its own module so the
// client-side login form can read them without pulling mongoose and bcrypt
// into the browser bundle.
export { SIGNIN_ERRORS };

/**
 * A sign-in refusal the form can act on.
 *
 * Auth.js collapses every `authorize` throw into the generic
 * `CredentialsSignin` type, so a plain `new Error("AccountSuspended")` reaches
 * the client as "Invalid email or password" and the user is told to check a
 * password that is perfectly correct. Subclassing lets us set `code`, which
 * Auth.js does surface — so the form can say what actually happened.
 */
class SignInRefusal extends CredentialsSignin {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const providers = [
  Credentials({
    name: "Credentials",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      if (!credentials?.email || !credentials?.password) return null;
      await connectDB();

      const email = String(credentials.email).toLowerCase().trim();
      const user = await User.findOne({ email });

      // No such account. Still runs a bcrypt comparison against a dummy
      // hash so the response time does not reveal whether the email exists.
      if (!user) {
        await bcrypt.compare(
          String(credentials.password),
          "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv"
        );
        return null;
      }

      if (user.lockedUntil && user.lockedUntil > new Date()) {
        throw new SignInRefusal(SIGNIN_ERRORS.LOCKED);
      }

      // A Google-created account has no password to compare against.
      if (!user.passwordHash) {
        throw new SignInRefusal(SIGNIN_ERRORS.USE_GOOGLE);
      }

      const valid = await bcrypt.compare(
        String(credentials.password),
        user.passwordHash
      );

      if (!valid) {
        // Per-account throttling, complementary to the per-IP limit on the
        // route: neither alone stops both a distributed attempt on one
        // account and one address spraying many accounts.
        const failed = (user.failedLoginCount || 0) + 1;
        const update = { failedLoginCount: failed };
        if (failed >= MAX_FAILED_LOGINS) {
          update.lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60_000);
          update.failedLoginCount = 0;
          log.warn("Account locked after repeated failed logins", {
            userId: String(user._id),
            lockoutMinutes: LOCKOUT_MINUTES,
          });
        }
        await User.updateOne({ _id: user._id }, { $set: update });
        return null;
      }

      /**
       * Suspension is checked **after** the password, deliberately.
       *
       * Checking it first was an information leak: anyone could discover that
       * an address has a suspended account just by submitting it with any
       * password. Verifying credentials first means only the person who
       * actually holds them — the one entitled to know — is told.
       */
      if (user.isSuspended) {
        log.warn("Suspended account attempted sign-in", {
          userId: String(user._id),
        });
        throw new SignInRefusal(SIGNIN_ERRORS.SUSPENDED);
      }

      // Success clears the counter, so one person fumbling their password
      // and then getting it right is not left throttled.
      if (user.failedLoginCount || user.lockedUntil) {
        await User.updateOne(
          { _id: user._id },
          { $set: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } }
        );
      } else {
        await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
      }

      return {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        image: user.image,
        tokenVersion: user.tokenVersion ?? 0,
        role: user.role ?? "user",
      };
    },
  }),
];

// Register Google only when configured, so the app boots fine without it.
if (isGoogleEnabled) {
  providers.unshift(
    Google({
      clientId: GOOGLE_ID,
      clientSecret: GOOGLE_SECRET,
      /**
       * Linking by email is intentional — it is what makes "I signed up
       * with email, now I want the Google button" work. The safety of it
       * rests entirely on Google having verified the address, which the
       * `signIn` callback below now checks explicitly rather than assumes.
       */
      allowDangerousEmailAccountLinking: true,
    })
  );
}

/**
 * NextAuth v5 configuration (App Router compatible).
 * JWT sessions with a credentials provider and optional Google OAuth.
 * Google sign-ins are upserted into the `User` collection so every
 * account — however it authenticated — lives in our database.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE_DAYS * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  pages: { signIn: "/login" },
  trustHost: true,
  providers,
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider !== "google") return true;

      // Linking on an unverified address would let anyone who can create a
      // Google account for someone else's email take over their SelfVue
      // account. Google effectively always sets this; checking it makes the
      // guarantee ours rather than an assumption about the provider.
      if (profile && profile.email_verified === false) {
        log.warn("Rejected Google sign-in with unverified email");
        return false;
      }

      try {
        await connectDB();
        const email = user.email?.toLowerCase();
        if (!email) return false;

        const existing = await User.findOne({ email });
        if (existing?.isSuspended) {
          log.warn("Suspended account attempted Google sign-in", {
            userId: String(existing._id),
          });
          return false;
        }
        if (!existing) {
          await User.create({
            name: user.name || email.split("@")[0],
            email,
            image: user.image,
            provider: "google",
            linkedProviders: ["google"],
          });
          return true;
        }

        // Record that Google now works for this account, and refresh the
        // avatar. `$addToSet` keeps this idempotent across repeat sign-ins.
        const update = { $addToSet: { linkedProviders: "google" } };
        if (user.image && existing.image !== user.image) {
          update.$set = { image: user.image, lastLoginAt: new Date() };
        } else {
          update.$set = { lastLoginAt: new Date() };
        }
        // Accounts that predate `linkedProviders` need their original
        // credentials login recorded too, or linking would appear to
        // replace it.
        if (!existing.linkedProviders?.length && existing.passwordHash) {
          update.$addToSet = { linkedProviders: { $each: ["credentials", "google"] } };
        }
        await User.updateOne({ _id: existing._id }, update);
        return true;
      } catch (err) {
        log.error("Google sign-in upsert failed", { message: err.message });
        return false;
      }
    },

    async jwt({ token, user, account }) {
      // Runs with `user` only on initial sign-in.
      if (user) {
        if (account?.provider === "google") {
          await connectDB();
          const dbUser = await User.findOne({
            email: user.email.toLowerCase(),
          }).select("_id tokenVersion role");
          if (dbUser) {
            token.id = dbUser._id.toString();
            token.tokenVersion = dbUser.tokenVersion ?? 0;
            token.role = dbUser.role ?? "user";
          }
        } else {
          token.id = user.id; // credentials → already the Mongo _id
          token.tokenVersion = user.tokenVersion ?? 0;
          token.role = user.role ?? "user";
        }
        return token;
      }

      /**
       * On every subsequent request, confirm the session has not been
       * revoked. This is the check that makes a password change mean
       * something: without it a stolen JWT stayed valid for the full 30-day
       * window after the victim "secured" their account.
       *
       * Cost is one indexed read per request. A DB hiccup returns the token
       * unchanged rather than logging everyone out — availability wins over
       * a slightly delayed revocation, and the token still expires.
       */
      if (token?.id) {
        try {
          await connectDB();
          const fresh = await User.findById(token.id)
            .select("tokenVersion role isSuspended")
            .lean();
          if (!fresh) return null; // account deleted → session ends
          if ((fresh.tokenVersion ?? 0) !== (token.tokenVersion ?? 0)) {
            return null; // credentials changed → session revoked
          }
          // Suspending someone must end the session they already hold, not
          // merely stop the next sign-in.
          if (fresh.isSuspended) return null;
          /**
           * Re-read on every request rather than trusting the token.
           *
           * A role is an authorisation decision, and a JWT is a snapshot. If
           * the role lived only in the token, revoking someone's admin would
           * not take effect until it expired — up to 30 days of access after
           * you removed it.
           */
          token.role = fresh.role ?? "user";
        } catch (err) {
          log.warn("Could not verify session token version", {
            message: err.message,
          });
        }
      }
      return token;
    },

    async session({ session, token }) {
      if (token?.id && session.user) {
        session.user.id = token.id;
        session.user.role = token.role ?? "user";
      }
      return session;
    },
  },
});

/**
 * Convenience helper mirroring v4's `getServerSession`.
 * @returns {Promise<import('next-auth').Session|null>}
 */
export async function getSession() {
  return auth();
}

/**
 * Revoke every existing session for a user by bumping their token version.
 * Call after any credential change — password set, change, or reset.
 * @param {string} userId
 */
export async function revokeSessions(userId) {
  await connectDB();
  await User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
}
