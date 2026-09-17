/**
 * Delete one account and everything belonging to it.
 *
 *   node scripts/delete-account.mjs someone@example.com --dry-run
 *   node scripts/delete-account.mjs someone@example.com --confirm
 *
 * ## Why this is a script and not a button
 *
 * The app deliberately offers export but not self-serve deletion: an action
 * that is immediate, total and irreversible should not sit one tap away from
 * a settings switch. The privacy page therefore tells users to ask, and this
 * is how that promise is kept. Without it, honouring a request would mean
 * hand-writing twenty `deleteMany` calls against production at the exact
 * moment care matters most.
 *
 * ## What it does
 *
 * Empties every collection that stores a `userId`, then removes the user.
 * `feedbacks` is the one exception: those rows are stripped of the account id
 * and contact address and kept, because feedback is usually a bug report that
 * is still open. The privacy page says so in as many words.
 *
 * The user document goes **last**, on purpose. While it exists the account
 * can still be signed into and the script re-run; deleting it first would
 * strand everything else with no way left to find it.
 *
 * `--dry-run` counts what would go and changes nothing. Running without
 * either flag is a dry run, so a mistyped command can never delete anybody.
 *
 * The collection list is checked against the app's models by
 * `src/features/account/collections.test.js`, so a model added later cannot
 * quietly escape deletion.
 */

import mongoose from "mongoose";
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

/**
 * Mongo collection names, not model names — this runs outside Next and has
 * no module aliases, so the models cannot be imported. The test named above
 * compares this list against `model().collection.name` for every model, which
 * is what stops the two drifting.
 */
const USER_COLLECTIONS = [
  "expenses",
  "incomes",
  "categories",
  "budgets",
  "debts",
  "financialgoals",
  "journalentries",
  "quicknotes",
  "habitlogs",
  "goals",
  "weeklygoals",
  "plannergoals",
  "plannerweekstates",
  "transactions",
  "sips",
  "insights",
  "patternruns",
  "pushsubscriptions",
  "notifications",
  "passwordresetcodes",
];

/** Kept, but no longer anybody's. */
const ANONYMISED = [
  { collection: "feedbacks", fields: { userId: null, contactEmail: null } },
];

const EMAIL = process.argv.find((arg) => arg.includes("@"))?.toLowerCase().trim();
const CONFIRMED = process.argv.includes("--confirm");

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set.");
  if (!EMAIL) {
    throw new Error(
      "Pass the account's email address:\n" +
        "  node scripts/delete-account.mjs someone@example.com --dry-run"
    );
  }

  await mongoose.connect(uri, { dbName: "personal-os" });
  const db = mongoose.connection;

  // Which database this is touching, with credentials stripped.
  console.log(`Database: ${uri.replace(/\/\/[^@]*@/, "//***@")}`);
  console.log(`Account:  ${EMAIL}`);
  console.log(CONFIRMED ? "Mode:     DELETING\n" : "Mode:     dry run\n");

  const user = await db.collection("users").findOne({ email: EMAIL });
  if (!user) throw new Error(`No account with the email ${EMAIL}.`);

  const userId = user._id;
  let total = 0;

  for (const name of USER_COLLECTIONS) {
    const collection = db.collection(name);
    const count = await collection.countDocuments({ userId });
    total += count;
    if (!count) continue;
    console.log(`  ${CONFIRMED ? "deleting" : "would delete"} ${String(count).padStart(6)}  ${name}`);
    if (CONFIRMED) await collection.deleteMany({ userId });
  }

  for (const { collection: name, fields } of ANONYMISED) {
    const collection = db.collection(name);
    const count = await collection.countDocuments({ userId });
    if (!count) continue;
    console.log(`  ${CONFIRMED ? "anonymising" : "would anonymise"} ${count}  ${name}`);
    if (CONFIRMED) await collection.updateMany({ userId }, { $set: fields });
  }

  if (CONFIRMED) {
    // Last, so a failure above leaves the account reachable and retryable.
    await db.collection("users").deleteOne({ _id: userId });
    console.log(`\nDeleted ${total} records and the account itself.`);
  } else {
    console.log(`\n${total} records across ${USER_COLLECTIONS.length} collections, plus the account.`);
    console.log("Dry run — re-run with --confirm to delete. This cannot be undone.");
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(`\n${err.message}`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
