/**
 * Backfill journal signal extraction over a user's existing entries.
 *
 *   node --env-file=.env.local scripts/backfill-journal-signals.mjs <email> \
 *        [--limit=50] [--force] [--dry]
 *
 * `--env-file` is Node's own loader (20.6+), so this needs no dotenv
 * dependency — the standing rule against new runtime dependencies applies
 * to scripts too.
 *
 * Three properties this script has to have, and does:
 *
 *   - **Opt-in.** It refuses unless that user has
 *     `preferences.journalExtraction` enabled. Backfilling is precisely
 *     the moment a lot of personal writing would leave the device at once,
 *     so it is the last place to be casual about consent.
 *   - **Idempotent.** Entries already carrying `signals.extractedAt` are
 *     skipped unless `--force`, so a re-run costs nothing and repairs a
 *     partial run rather than duplicating it.
 *   - **Resumable and rate-limited.** It processes oldest-first in a
 *     bounded batch with a pause between calls, and prints where it got
 *     to, so an interrupted run is just a shorter run.
 */

import mongoose from "mongoose";

if (!process.env.MONGODB_URI) {
  console.error(
    "MONGODB_URI is not set. Run this with:\n" +
      "  node --env-file=.env.local scripts/backfill-journal-signals.mjs <email>"
  );
  process.exit(1);
}

const { default: connectDB } = await import("../src/lib/mongoose.js");
const { default: DailyJournal } = await import("../src/models/DailyJournal.js");
const { default: User } = await import("../src/models/User.js");
const { extractJournalSignals, wordCount, MIN_WORDS_FOR_EXTRACTION } = await import(
  "../src/features/patterns/extract.js"
);

/** Pause between calls — Groq's free tier is not generous. */
const DELAY_MS = 1500;

const args = process.argv.slice(2);
const email = args.find((a) => !a.startsWith("--"));
const limit = Number(args.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? 50);
const force = args.includes("--force");
const dry = args.includes("--dry");

if (!email) {
  console.error("Usage: node scripts/backfill-journal-signals.mjs <email> [--limit=50] [--force] [--dry]");
  process.exit(1);
}

await connectDB();

const user = await User.findOne({ email: email.toLowerCase() })
  .select("_id email preferences")
  .lean();

if (!user) {
  console.error(`No user found for ${email}.`);
  await mongoose.disconnect();
  process.exit(1);
}

if (!user.preferences?.journalExtraction) {
  console.error(
    `${user.email} has not enabled journal analysis. Turn it on in the app first — this script will not do it for them.`
  );
  await mongoose.disconnect();
  process.exit(1);
}

const query = {
  userId: user._id,
  content: { $nin: [null, ""] },
  ...(force ? {} : { "signals.extractedAt": { $exists: false } }),
};

const entries = await DailyJournal.find(query)
  .select("date content")
  .sort({ date: 1 })
  .limit(limit)
  .lean();

console.log(
  `${entries.length} ${force ? "entries" : "un-extracted entries"} for ${user.email}${dry ? " (dry run)" : ""}.`
);

let extracted = 0;
let skipped = 0;
let failed = 0;

for (const entry of entries) {
  if (wordCount(entry.content) < MIN_WORDS_FOR_EXTRACTION) {
    skipped++;
    continue;
  }

  if (dry) {
    console.log(`  would extract ${entry.date} (${wordCount(entry.content)} words)`);
    extracted++;
    continue;
  }

  const signals = await extractJournalSignals(entry.content);
  if (!signals) {
    // Discarded rather than stored — see extract.js. A gap is fine; a
    // fabricated sentiment would be correlated against as though real.
    console.warn(`  ${entry.date}: extraction discarded`);
    failed++;
  } else {
    await DailyJournal.updateOne({ _id: entry._id }, { $set: { signals } });
    console.log(`  ${entry.date}: sentiment ${signals.sentiment}, energy ${signals.energy ?? "—"}`);
    extracted++;
  }

  await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
}

console.log(
  `\nDone. ${extracted} extracted, ${skipped} too short, ${failed} discarded.` +
    (entries.length === limit ? `\nHit the --limit of ${limit}; run again to continue.` : "")
);

await mongoose.disconnect();
