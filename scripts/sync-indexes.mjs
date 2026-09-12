/**
 * Reconcile the database's indexes with what the models declare.
 *
 *   node scripts/sync-indexes.mjs --dry-run
 *   node scripts/sync-indexes.mjs
 *
 * Mongoose creates missing indexes in the background but **never drops**
 * ones you have stopped declaring. Several were superseded during the
 * performance work — `{userId, date}` on expenses became
 * `{userId, deletedAt, date}`, for instance — and a stale index is not
 * harmless: every write has to maintain it, and it occupies RAM the useful
 * indexes want.
 *
 * `syncIndexes()` per model does both halves: create what is declared, drop
 * what is not. `_id_` and anything Mongo manages itself is left alone.
 *
 * Run it after deploying a model change. Safe to re-run; on a large
 * collection index builds take time, so prefer a quiet period.
 */

import mongoose from "mongoose";
import { readFileSync } from "node:fs";

try {
  const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of env.split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {
  // Ambient environment only.
}

const DRY_RUN = process.argv.includes("--dry-run");

/** Every model that owns indexes. Import order does not matter. */
const MODEL_PATHS = [
  "../src/models/Budget.js",
  "../src/models/Category.js",
  "../src/models/DailyJournal.js",
  "../src/models/Debt.js",
  "../src/models/Expense.js",
  "../src/models/Feedback.js",
  "../src/models/FinancialGoal.js",
  "../src/models/Goal.js",
  "../src/models/HabitLog.js",
  "../src/models/Insight.js",
  "../src/models/PasswordResetToken.js",
  "../src/models/PatternRun.js",
  "../src/models/PlannerGoal.js",
  "../src/models/PlannerWeekState.js",
  "../src/models/QuickNote.js",
  "../src/models/SIP.js",
  "../src/models/StockPrice.js",
  "../src/models/Transaction.js",
  "../src/models/User.js",
  "../src/models/WeeklyGoal.js",
];

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set.");

  await mongoose.connect(uri, { dbName: "personal-os" });
  console.log(`Connected. ${DRY_RUN ? "DRY RUN — nothing will change.\n" : "Syncing.\n"}`);

  const models = [];
  for (const path of MODEL_PATHS) {
    try {
      const mod = await import(path);
      models.push(mod.default);
    } catch (err) {
      console.warn(`  skipped ${path}: ${err.message}`);
    }
  }

  let created = 0;
  let dropped = 0;

  for (const Model of models) {
    const name = Model.collection.collectionName;

    // What the database has now, versus what the schema declares.
    let existing = [];
    try {
      existing = await Model.collection.indexes();
    } catch {
      // Collection does not exist yet — nothing to reconcile.
      console.log(`${name}: collection not created yet, skipping.`);
      continue;
    }

    const declared = Model.schema.indexes().map(([spec]) => JSON.stringify(spec));
    const existingNonId = existing.filter((i) => i.name !== "_id_");

    const stale = existingNonId.filter(
      (i) => !declared.includes(JSON.stringify(i.key))
    );

    if (DRY_RUN) {
      console.log(`${name}:`);
      console.log(`  declared: ${declared.length}, in database: ${existingNonId.length}`);
      for (const s of stale) {
        console.log(`  would DROP  ${s.name}  ${JSON.stringify(s.key)}`);
      }
      const existingKeys = existingNonId.map((i) => JSON.stringify(i.key));
      for (const d of declared) {
        if (!existingKeys.includes(d)) console.log(`  would CREATE ${d}`);
      }
      continue;
    }

    const result = await Model.syncIndexes();
    // syncIndexes returns the names it dropped.
    const droppedNames = Array.isArray(result) ? result : [];
    dropped += droppedNames.length;
    created += Math.max(0, declared.length - (existingNonId.length - droppedNames.length));

    console.log(
      `${name}: synced (${declared.length} declared${
        droppedNames.length ? `, dropped ${droppedNames.join(", ")}` : ""
      })`
    );
  }

  if (!DRY_RUN) {
    console.log(`\nDone. Indexes created: ~${created}, dropped: ${dropped}.`);
  } else {
    console.log("\nDry run complete — re-run without --dry-run to apply.");
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("\nIndex sync failed:", err.message);
  process.exitCode = 1;
});
