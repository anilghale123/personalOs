/**
 * Create (or promote) the super admin.
 *
 *   node scripts/seed-superadmin.mjs
 *   SUPERADMIN_EMAIL=you@example.com SUPERADMIN_PASSWORD='...' node scripts/seed-superadmin.mjs
 *
 * Idempotent in a specific way, and the distinction matters:
 *
 *   - No account with that email → creates one as superadmin.
 *   - Account exists, not superadmin → **promotes** it, leaves the password alone.
 *   - Account exists and is superadmin → reports and changes nothing.
 *
 * Re-running never resets a password that has since been changed. That is
 * deliberate: a seed script that silently reverted the admin password every
 * deploy would quietly undo the first thing anyone should do here.
 * `--reset-password` opts into it explicitly.
 *
 * ## About the default credentials
 *
 * The defaults below were specified for this project and are committed, which
 * means they are **not a secret**. Anyone with the repository has them. Treat
 * the seeded password as a first-run credential only and change it from the
 * profile screen as soon as you have signed in once — or better, set
 * SUPERADMIN_PASSWORD in the environment and never let the default apply.
 */

import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";

/* Load .env.local without adding a dotenv dependency. */
try {
  const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of env.split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {
  // Rely on the ambient environment instead.
}

const EMAIL = (process.env.SUPERADMIN_EMAIL || "ghaleanil30@gmail.com")
  .toLowerCase()
  .trim();
const PASSWORD = process.env.SUPERADMIN_PASSWORD || "make_this_secure_123";
const NAME = process.env.SUPERADMIN_NAME || "Anil Ghale";
const RESET_PASSWORD = process.argv.includes("--reset-password");

/** Matches the cost factor used everywhere else in the app. */
const BCRYPT_ROUNDS = 12;

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set.");

  if (PASSWORD.length < 10) {
    throw new Error(
      "SUPERADMIN_PASSWORD must be at least 10 characters — the app enforces " +
        "that minimum, so a shorter one could never be re-entered."
    );
  }

  await mongoose.connect(uri, { dbName: "personal-os" });
  const users = mongoose.connection.collection("users");

  /**
   * Say which database this is touching, with credentials stripped.
   *
   * The role is granted in one specific database. Running this locally seeds
   * whatever `.env.local` points at — which is not necessarily what the
   * deployment uses, and the symptom of that mismatch is a bare 404 on
   * /sysadmin with nothing to suggest the cause. Printing the host makes it
   * obvious whether you just seeded the database you meant to.
   */
  const host = uri.replace(/^(mongodb(?:\+srv)?:\/\/)[^@]*@/, "$1<credentials>@");
  console.log(`Database: ${host.split("?")[0]}`);
  console.log(`          (dbName "personal-os")\n`);

  const existing = await users.findOne({ email: EMAIL });
  const now = new Date();

  if (!existing) {
    const passwordHash = await bcrypt.hash(PASSWORD, BCRYPT_ROUNDS);
    const { insertedId } = await users.insertOne({
      name: NAME,
      email: EMAIL,
      passwordHash,
      provider: "credentials",
      linkedProviders: ["credentials"],
      role: "superadmin",
      isSuspended: false,
      tokenVersion: 0,
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: null,
      preferences: { journalExtraction: false, dateFormat: "english" },
      createdAt: now,
      updatedAt: now,
    });

    console.log(`Created super admin ${EMAIL} (${insertedId}).`);
    console.log("\n  Sign in at /login, then open /sysadmin.");
    warnAboutDefaultPassword();
    await mongoose.disconnect();
    return;
  }

  const update = { updatedAt: now };
  const actions = [];

  if (existing.role !== "superadmin") {
    update.role = "superadmin";
    actions.push(`promoted from "${existing.role ?? "user"}" to superadmin`);
  }

  if (existing.isSuspended) {
    update.isSuspended = false;
    update.suspendedAt = null;
    actions.push("un-suspended");
  }

  if (RESET_PASSWORD) {
    update.passwordHash = await bcrypt.hash(PASSWORD, BCRYPT_ROUNDS);
    update.failedLoginCount = 0;
    update.lockedUntil = null;
    // Every existing session for this account is invalidated, which is the
    // point of a password reset.
    update.tokenVersion = (existing.tokenVersion ?? 0) + 1;
    actions.push("password reset (all sessions revoked)");
  }

  if (actions.length === 0) {
    console.log(`${EMAIL} is already a super admin. Nothing to do.`);
    console.log("  Use --reset-password to set the password again.");
    await mongoose.disconnect();
    return;
  }

  await users.updateOne({ _id: existing._id }, { $set: update });
  console.log(`Updated ${EMAIL}: ${actions.join(", ")}.`);
  if (RESET_PASSWORD) warnAboutDefaultPassword();

  await mongoose.disconnect();
}

function warnAboutDefaultPassword() {
  if (process.env.SUPERADMIN_PASSWORD) return;
  console.log(
    "\n  WARNING: this used the default password committed in the repository.\n" +
      "  It is not a secret. Change it from the profile screen after signing\n" +
      "  in, or re-run with SUPERADMIN_PASSWORD set.\n"
  );
}

main().catch((err) => {
  console.error("\nSeeding failed:", err.message);
  process.exitCode = 1;
});
