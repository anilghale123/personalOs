/**
 * Merge duplicate expense categories.
 *
 *   node scripts/dedupe-categories.mjs --dry-run
 *   node scripts/dedupe-categories.mjs
 *
 * ## Why
 *
 * A new account's first load fires several category requests at once. Each
 * saw "no categories yet" and seeded the full default set, and the cached
 * answer was never cleared, so some users ended up with every default three
 * or four times. The seeding is fixed, and Category now has a unique
 * `{userId, parentId, name}` index — but that index cannot be built while the
 * duplicates exist. Run this first, then `npm run db:indexes`.
 *
 * ## What it does
 *
 * Groups each user's categories by level and case-insensitive name. In every
 * group it keeps one — an active one over an archived one, then the oldest —
 * and points everything at it before deleting the rest:
 *
 *   - expenses move to the kept category;
 *   - subcategories move under it;
 *   - budgets move to it, unless it already has a budget for that same
 *     period, in which case the duplicate's budget is dropped (the unique
 *     budget index allows only one).
 *
 * Top-level categories are merged first, then the pass repeats, because
 * moving subcategories under one parent can leave duplicates among them.
 * Running without writes (`--dry-run`) only reports. Safe to re-run.
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
const nameKey = (name) => String(name ?? "").trim().replace(/\s+/g, " ").toLowerCase();

async function mergePass(db) {
  const categories = db.collection("categories");
  const expenses = db.collection("expenses");
  const budgets = db.collection("budgets");

  const all = await categories
    .find({}, { projection: { userId: 1, parentId: 1, name: 1, isArchived: 1, createdAt: 1 } })
    .toArray();

  const groups = new Map();
  for (const c of all) {
    const key = `${c.userId}|${c.parentId ?? ""}|${nameKey(c.name)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }

  let merged = 0;
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    group.sort(
      (a, b) =>
        Number(Boolean(a.isArchived)) - Number(Boolean(b.isArchived)) ||
        (a.createdAt?.getTime?.() ?? 0) - (b.createdAt?.getTime?.() ?? 0) ||
        String(a._id).localeCompare(String(b._id))
    );
    const [keep, ...dupes] = group;
    const dupeIds = dupes.map((d) => d._id);
    const userId = keep.userId;

    const expenseCount = await expenses.countDocuments({ userId, categoryId: { $in: dupeIds } });
    console.log(
      `  ${userId}  "${keep.name}"  keep ${keep._id}, merge ${dupes.length} (${expenseCount} expenses)`
    );
    merged += dupes.length;
    if (DRY_RUN) continue;

    await expenses.updateMany(
      { userId, categoryId: { $in: dupeIds } },
      { $set: { categoryId: keep._id } }
    );
    await categories.updateMany(
      { userId, parentId: { $in: dupeIds } },
      { $set: { parentId: keep._id } }
    );

    for (const budget of await budgets.find({ userId, categoryId: { $in: dupeIds } }).toArray()) {
      const taken = await budgets.findOne({
        userId,
        period: budget.period,
        periodStart: budget.periodStart,
        scope: budget.scope,
        categoryId: keep._id,
      });
      if (taken) await budgets.deleteOne({ _id: budget._id });
      else await budgets.updateOne({ _id: budget._id }, { $set: { categoryId: keep._id } });
    }

    await categories.deleteMany({ _id: { $in: dupeIds }, userId });
  }
  return merged;
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set.");

  await mongoose.connect(uri, { dbName: "personal-os" });
  console.log(`Connected. ${DRY_RUN ? "DRY RUN — nothing will change.\n" : "Merging.\n"}`);
  const db = mongoose.connection.db;

  let total = 0;
  // A dry run cannot see the second-level duplicates a real merge would
  // create, so one pass is all it can report.
  for (let pass = 1; pass <= (DRY_RUN ? 1 : 3); pass++) {
    const merged = await mergePass(db);
    total += merged;
    if (merged === 0) break;
  }

  console.log(
    total === 0
      ? "\nNo duplicates found."
      : DRY_RUN
        ? `\n${total} duplicate categories would be merged. Re-run without --dry-run to apply.`
        : `\nMerged ${total} duplicate categories. Now run: npm run db:indexes`
  );

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
