import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import connectDB from "@/lib/mongoose";
import User from "@/models/User";

const GOOGLE_ID = process.env.AUTH_GOOGLE_ID || process.env.GOOGLE_CLIENT_ID;
const GOOGLE_SECRET =
  process.env.AUTH_GOOGLE_SECRET || process.env.GOOGLE_CLIENT_SECRET;

/** True when Google OAuth credentials are configured. */
export const isGoogleEnabled = Boolean(GOOGLE_ID && GOOGLE_SECRET);

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
      const user = await User.findOne({
        email: String(credentials.email).toLowerCase(),
      });
      if (!user || !user.passwordHash) return null;
      const valid = await bcrypt.compare(
        String(credentials.password),
        user.passwordHash
      );
      if (!valid) return null;
      return {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        image: user.image,
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
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  trustHost: true,
  providers,
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== "google") return true;
      try {
        await connectDB();
        const email = user.email?.toLowerCase();
        if (!email) return false;
        const existing = await User.findOne({ email });
        if (!existing) {
          await User.create({
            name: user.name || email.split("@")[0],
            email,
            image: user.image,
            provider: "google",
          });
        } else if (user.image && existing.image !== user.image) {
          existing.image = user.image;
          await existing.save();
        }
        return true;
      } catch (err) {
        console.error("Google sign-in upsert failed:", err);
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
          });
          if (dbUser) token.id = dbUser._id.toString();
        } else {
          token.id = user.id; // credentials → already the Mongo _id
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token?.id && session.user) session.user.id = token.id;
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
