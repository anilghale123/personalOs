import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  USER_COLLECTIONS,
  ANONYMISED_ON_DELETE,
  EXPORT_EXCLUDED,
} from "./collections";

const HERE = dirname(fileURLToPath(import.meta.url));
const MODELS_DIR = join(HERE, "..", "..", "models");
const DELETE_SCRIPT = join(HERE, "..", "..", "..", "scripts", "delete-account.mjs");

/**
 * Models that hold no user data and so belong on neither list.
 *
 * `StockPrice` is shared reference data — NEPSE closing prices, the same for
 * everybody. `User` is the account itself, handled directly by the export and
 * delete routes rather than as one collection among many.
 */
const NOT_USER_OWNED = new Set(["StockPrice", "User"]);

/** Every model whose schema carries a `userId`. */
function modelsWithUserId() {
  return readdirSync(MODELS_DIR)
    .filter((file) => file.endsWith(".js"))
    .map((file) => file.replace(/\.js$/, ""))
    .filter((name) => !NOT_USER_OWNED.has(name))
    .filter((name) =>
      /\buserId\b/.test(readFileSync(join(MODELS_DIR, `${name}.js`), "utf8"))
    );
}

describe("USER_COLLECTIONS", () => {
  /**
   * The test this file exists for.
   *
   * Deleting an account has to empty every collection the account touched.
   * The failure mode is not dramatic — someone adds a model, wires it into a
   * feature, and never thinks about the delete path — and the result is a
   * user's data sitting on a server they believe they have left. So the list
   * is checked against the models directory rather than against memory.
   */
  it("accounts for every model that stores a userId", () => {
    const declared = new Set(
      [...USER_COLLECTIONS, ...ANONYMISED_ON_DELETE].map(
        (c) => c.model().modelName
      )
    );
    const missing = modelsWithUserId().filter((name) => !declared.has(name));

    expect(
      missing,
      `These models store a userId but are on neither list, so an account ` +
        `deletion would leave their documents behind: ${missing.join(", ")}. ` +
        `Add each to USER_COLLECTIONS to delete it, or to ` +
        `ANONYMISED_ON_DELETE — with a reason — to keep it unattached.`
    ).toEqual([]);
  });

  it("never both deletes and anonymises the same collection", () => {
    const deleted = new Set(USER_COLLECTIONS.map((c) => c.model().modelName));
    for (const collection of ANONYMISED_ON_DELETE) {
      expect(deleted.has(collection.model().modelName)).toBe(false);
    }
  });

  /** An "anonymised" row that keeps a link back to the person is not. */
  it("clears every identifying field on an anonymised collection", () => {
    for (const collection of ANONYMISED_ON_DELETE) {
      const cleared = Object.entries(collection.fields);
      expect(cleared.length).toBeGreaterThan(0);
      expect(cleared.every(([, value]) => value === null)).toBe(true);
      expect(Object.keys(collection.fields)).toContain("userId");
    }
  });

  it("names no model twice", () => {
    const names = USER_COLLECTIONS.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);

    const models = USER_COLLECTIONS.map((c) => c.model().modelName);
    expect(new Set(models).size).toBe(models.length);
  });

  it("resolves every model", () => {
    for (const collection of USER_COLLECTIONS) {
      expect(typeof collection.model().modelName).toBe("string");
    }
  });

  /**
   * The deletion script runs outside Next, so it cannot import the models
   * and has to name Mongo collections as strings. That list is the one place
   * in the codebase that can silently fall out of step with the schemas — a
   * model added next year, or a `collection:` override on an existing one,
   * and a deletion quietly stops being complete. `DailyJournal` already
   * overrides its name to `journalentries` rather than the default, which is
   * exactly the kind of thing memory gets wrong.
   */
  it("matches the collection names the deletion script deletes", () => {
    const script = readFileSync(DELETE_SCRIPT, "utf8");
    const listed = new Set(
      script
        .slice(
          script.indexOf("const USER_COLLECTIONS = ["),
          script.indexOf("const ANONYMISED = [")
        )
        .match(/"([a-z]+)"/g)
        ?.map((quoted) => quoted.slice(1, -1)) ?? []
    );

    const expected = USER_COLLECTIONS.map((c) => c.model().collection.name);
    const missing = expected.filter((name) => !listed.has(name));
    const extra = [...listed].filter((name) => !expected.includes(name));

    expect(
      missing,
      `scripts/delete-account.mjs does not delete: ${missing.join(", ")}`
    ).toEqual([]);
    expect(
      extra,
      `scripts/delete-account.mjs names collections no model uses: ${extra.join(", ")}`
    ).toEqual([]);
  });

  it("matches the collection the deletion script anonymises", () => {
    const script = readFileSync(DELETE_SCRIPT, "utf8");
    for (const collection of ANONYMISED_ON_DELETE) {
      expect(script).toContain(`"${collection.model().collection.name}"`);
    }
  });

  it("only excludes collections it actually has", () => {
    const names = new Set(USER_COLLECTIONS.map((c) => c.name));
    for (const excluded of EXPORT_EXCLUDED) {
      expect(names.has(excluded)).toBe(true);
    }
  });
});
