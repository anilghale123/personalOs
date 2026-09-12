import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    // Optional — OAuth (Google) accounts have no local password.
    passwordHash: { type: String },
    image: String,
    provider: {
      type: String,
      enum: ["credentials", "google"],
      default: "credentials",
    },
    /**
     * Every provider this account can actually sign in with.
     *
     * `provider` records only how the account was *created*, so after a
     * Google sign-in linked to an email account it kept saying
     * "credentials" forever — and the database stopped being able to answer
     * "how does this person log in", which is the first thing you need when
     * debugging a login complaint. This is the honest answer; `provider` is
     * retained so nothing that reads it breaks.
     */
    linkedProviders: {
      type: [{ type: String, enum: ["credentials", "google"] }],
      default: undefined,
    },
    /**
     * Authorisation role.
     *
     * Three levels, deliberately few:
     *   `user`       — everyone. The only role a signup can produce.
     *   `admin`      — can read the admin dashboard and manage ordinary users.
     *   `superadmin` — can additionally grant and revoke admin, and is the
     *                  only role that can touch another admin.
     *
     * Stored on the user rather than in a separate table because the check
     * happens on every admin request and a join would be pure cost. It is
     * **never** settable from a signup or profile payload — see the route
     * schemas, which omit it entirely — so the only ways in are the seed
     * script and an existing superadmin.
     */
    role: {
      type: String,
      enum: ["user", "admin", "superadmin"],
      default: "user",
      index: true,
    },
    /**
     * Suspension. A suspended account keeps all its data but cannot sign in,
     * which is the right tool for abuse: deleting someone's financial history
     * to stop them spamming is a wildly disproportionate response.
     */
    isSuspended: { type: Boolean, default: false },
    suspendedAt: { type: Date, default: null },
    suspendedReason: { type: String, trim: true },
    /**
     * Bumped whenever credentials change. Stamped into every JWT and
     * compared on each request, which is what makes a password change
     * actually revoke existing sessions — a stateless JWT is otherwise
     * valid until it expires, so "I changed my password because I think
     * someone's in my account" previously revoked nothing at all.
     */
    tokenVersion: { type: Number, default: 0 },
    /**
     * Failed-login tracking for per-account throttling. IP-based rate
     * limiting alone does not stop a distributed attempt against one
     * account, and this does not stop one IP spraying many accounts — the
     * two are complementary, so both exist.
     */
    failedLoginCount: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    /**
     * Additive and optional — documents written before this existed
     * simply lack it, and `journalExtraction` is read as opt-in.
     *
     * Journal text already reaches Groq through the reflect and briefing
     * routes, but extraction makes that systematic and continuous. Some
     * people will want the pattern engine and not text analysis, and
     * that is a reasonable position to support.
     */
    preferences: {
      journalExtraction: { type: Boolean, default: false },
      // Which calendar the money screens group and label months by.
      // English (Gregorian) is the default; Nepali (Bikram Sambat) is
      // opt-in for users in Nepal.
      dateFormat: {
        type: String,
        enum: ["english", "nepali"],
        default: "english",
      },
    },
  },
  { timestamps: true }
);

/** The admin user list: newest first, and filterable by role. */
UserSchema.index({ createdAt: -1 });
UserSchema.index({ role: 1, createdAt: -1 });
/** "Active users" is a `lastLoginAt` range scan. */
UserSchema.index({ lastLoginAt: -1 });

export default mongoose.models.User || mongoose.model("User", UserSchema);
