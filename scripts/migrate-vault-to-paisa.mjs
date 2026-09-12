/**
 * Migrate vault money from float rupees to integer paisa.
 *
 *   node scripts/migrate-vault-to-paisa.mjs --dry-run
 *   node scripts/migrate-vault-to-paisa.mjs
 *
 * What it does, per collection:
 *
 *   SIP       monthlyAmount           → monthlyAmountPaisa
 *             installments[].amountInvested → amountInvestedPaisa
 *             installments[].navAtPurchase  → navAtPurchasePaisa
 *             installments[].unitsPurchased → unitsScaled (× 10,000)
 *
 * It is **idempotent**: a document that already has the paisa field is left
 * alone, so re-running after a partial failure is safe and the app can keep
 * serving throughout (the sip-math accessors read either shape).
 *
 * It also **repairs** the damage the old code could do: an installment whose
 * `unitsPurchased` is NaN, Infinity or negative gets recomputed from amount
 * and NAV where possible, and reported where not. Those rows are the reason
 * this migration exists rather than being cosmetic — they were being summed
 * into portfolio totals with no way to tell which total was wrong.
 *
 * Take a backup first. `--dry-run` prints exactly what would change.
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

const DRY_RUN = process.argv.includes("--dry-run");
const UNIT_SCALE = 10_000;

/** Rupees → integer paisa. Returns null for anything unusable. */
function toPaisa(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/** Units → scaled integer. Returns null for anything unusable. */
function toScaled(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * UNIT_SCALE);
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set.");

  await mongoose.connect(uri, { dbName: "personal-os" });
  console.log(`Connected. ${DRY_RUN ? "DRY RUN — nothing will be written." : "Writing changes."}\n`);

  const sips = mongoose.connection.collection("sips");

  const stats = {
    scanned: 0,
    monthlyMigrated: 0,
    installmentsMigrated: 0,
    unitsRepaired: 0,
    unitsUnrepairable: 0,
    untouched: 0,
  };
  const problems = [];

  const cursor = sips.find({});
  for await (const sip of cursor) {
    stats.scanned++;
    const set = {};

    /* ---- monthly commitment ---- */
    if (!Number.isFinite(sip.monthlyAmountPaisa)) {
      const paisa = toPaisa(sip.monthlyAmount);
      if (paisa === null) {
        problems.push(
          `SIP ${sip._id} (${sip.fundName ?? "unnamed"}): monthlyAmount is ${JSON.stringify(sip.monthlyAmount)} — cannot convert, left unset.`
        );
      } else {
        set.monthlyAmountPaisa = paisa;
        stats.monthlyMigrated++;
      }
    }

    /* ---- installments ---- */
    const installments = Array.isArray(sip.installments) ? sip.installments : [];
    installments.forEach((inst, i) => {
      const prefix = `installments.${i}`;

      const needsAmount = !Number.isFinite(inst?.amountInvestedPaisa);
      const needsNav = !Number.isFinite(inst?.navAtPurchasePaisa);
      const needsUnits = !Number.isFinite(inst?.unitsScaled);

      if (!needsAmount && !needsNav && !needsUnits) return;

      let amountPaisa = Number.isFinite(inst?.amountInvestedPaisa)
        ? inst.amountInvestedPaisa
        : toPaisa(inst?.amountInvested);
      let navPaisa = Number.isFinite(inst?.navAtPurchasePaisa)
        ? inst.navAtPurchasePaisa
        : toPaisa(inst?.navAtPurchase);

      if (needsAmount) {
        if (amountPaisa === null) {
          problems.push(
            `SIP ${sip._id} ${prefix}: amountInvested is ${JSON.stringify(inst?.amountInvested)} — cannot convert.`
          );
        } else {
          set[`${prefix}.amountInvestedPaisa`] = amountPaisa;
          stats.installmentsMigrated++;
        }
      }

      if (needsNav && navPaisa !== null && navPaisa > 0) {
        set[`${prefix}.navAtPurchasePaisa`] = navPaisa;
      }

      if (needsUnits) {
        const existing = toScaled(inst?.unitsPurchased);

        if (existing !== null && existing > 0) {
          // The stored value was usable — carry it across as-is.
          set[`${prefix}.unitsScaled`] = existing;
        } else if (
          amountPaisa !== null &&
          amountPaisa > 0 &&
          navPaisa !== null &&
          navPaisa > 0
        ) {
          // The stored value was NaN/Infinity/negative — recompute it. This
          // is the poisoned-row repair.
          set[`${prefix}.unitsScaled`] = Math.round(
            (amountPaisa / navPaisa) * UNIT_SCALE
          );
          stats.unitsRepaired++;
          problems.push(
            `SIP ${sip._id} ${prefix}: unitsPurchased was ${JSON.stringify(inst?.unitsPurchased)} — recomputed from amount ÷ NAV.`
          );
        } else {
          // No NAV to recompute from. Record 0 units rather than leave a
          // NaN that would keep corrupting sums.
          set[`${prefix}.unitsScaled`] = 0;
          stats.unitsUnrepairable++;
          problems.push(
            `SIP ${sip._id} ${prefix}: unitsPurchased was ${JSON.stringify(inst?.unitsPurchased)} and no usable NAV — set to 0 units. The invested amount is preserved; re-enter the NAV to restore units.`
          );
        }
      }
    });

    if (Object.keys(set).length === 0) {
      stats.untouched++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`SIP ${sip._id} (${sip.fundName ?? "unnamed"}) would set:`);
      for (const [k, v] of Object.entries(set)) console.log(`    ${k} = ${v}`);
    } else {
      await sips.updateOne({ _id: sip._id }, { $set: set });
    }
  }

  console.log("\n──────── summary ────────");
  console.log(`SIPs scanned:                ${stats.scanned}`);
  console.log(`Monthly amounts migrated:    ${stats.monthlyMigrated}`);
  console.log(`Installments migrated:       ${stats.installmentsMigrated}`);
  console.log(`Unit counts repaired:        ${stats.unitsRepaired}`);
  console.log(`Unit counts unrecoverable:   ${stats.unitsUnrepairable}`);
  console.log(`Already migrated:            ${stats.untouched}`);

  if (problems.length) {
    console.log(`\n──────── ${problems.length} item(s) needing attention ────────`);
    for (const p of problems) console.log(`  • ${p}`);
  } else {
    console.log("\nNo data problems found.");
  }

  if (DRY_RUN) {
    console.log("\nDry run complete — re-run without --dry-run to apply.");
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("\nMigration failed:", err.message);
  process.exitCode = 1;
});
