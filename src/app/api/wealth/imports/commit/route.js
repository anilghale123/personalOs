import { withRoute, json, badRequest, ApiError } from "@/lib/api";
import { z, amountMajor, dateKey, objectId } from "@/lib/validation";
import { requirePro } from "@/lib/entitlements";
import { invalidateMoney } from "@/lib/cache";
import { log } from "@/lib/logger";
import { INCOME_CATEGORIES } from "@/features/wealth/constants";
import { PARSER_IDS } from "@/features/wealth/imports/parsers";
import { findAlreadyImported } from "@/features/wealth/imports/dedupe";
import Category from "@/models/Category";
import Expense from "@/models/Expense";
import Income from "@/models/Income";

const MAX_ROWS = 1000;

const Row = z.object({
  date: dateKey,
  description: z.string().trim().max(500),
  direction: z.enum(["withdraw", "deposit"]),
  amount: amountMajor,
  categoryId: objectId.optional(),
  incomeCategory: z.enum(INCOME_CATEGORIES).optional(),
  fingerprint: z.string().regex(/^[a-f0-9]{40}$/, "Invalid row fingerprint."),
});

const CommitBody = z.object({
  bank: z.enum(PARSER_IDS),
  transactions: z.array(Row).min(1, "Select at least one row to import.").max(MAX_ROWS),
});

/**
 * POST /api/wealth/imports/commit — save the rows the user selected. Pro only.
 *
 * Body: { bank, transactions: [{ date, description, direction, amount,
 *                                categoryId?, incomeCategory?, fingerprint }] }
 * → { created, skippedDuplicates }
 * → 409 `already_imported` when every row is already in the user's records.
 *
 * Withdrawals become expenses (category required), deposits become income.
 * Duplicates — by fingerprint, or by date + amount + description for rows
 * saved without one — are never inserted, whatever the client sends.
 */
export const POST = withRoute(
  { limit: "statementImport", body: CommitBody },
  async ({ userId, input }) => {
    await requirePro(userId, "Bank statement import is a Pro feature.");

    const missing = input.transactions.filter((t) => t.direction === "withdraw" && !t.categoryId);
    if (missing.length) {
      throw badRequest(`${missing.length} withdrawal(s) need a category before importing.`);
    }

    const categoryIds = [...new Set(input.transactions.map((t) => t.categoryId).filter(Boolean))];
    if (categoryIds.length) {
      const owned = await Category.countDocuments({ _id: { $in: categoryIds }, userId });
      if (owned !== categoryIds.length) throw badRequest("One of the selected categories was not found.");
    }

    const imported = await findAlreadyImported(
      userId,
      input.transactions.map((t) => ({
        fingerprint: t.fingerprint,
        date: t.date,
        direction: t.direction,
        paisa: t.amount,
        description: t.description,
      }))
    );

    const source = `import:${input.bank}`;
    const seen = new Set();
    const newExpenses = [];
    const newIncome = [];
    let skippedDuplicates = 0;

    input.transactions.forEach((t, i) => {
      if (imported[i] || seen.has(t.fingerprint)) {
        skippedDuplicates++;
        return;
      }
      seen.add(t.fingerprint);

      const common = {
        userId,
        amountPaisa: t.amount,
        currency: "NPR",
        date: t.date,
        note: t.description || undefined,
        source,
        fingerprint: t.fingerprint,
      };
      if (t.direction === "withdraw") {
        newExpenses.push({ ...common, categoryId: t.categoryId, paymentMethod: "bank_transfer" });
      } else {
        newIncome.push({ ...common, category: t.incomeCategory ?? "Other" });
      }
    });

    if (!newExpenses.length && !newIncome.length) {
      throw new ApiError(
        409,
        "These transactions have already been imported. Nothing new was added.",
        "already_imported",
        { skippedDuplicates }
      );
    }

    await Promise.all([
      newExpenses.length ? Expense.insertMany(newExpenses, { ordered: false }) : null,
      newIncome.length ? Income.insertMany(newIncome, { ordered: false }) : null,
    ]);

    invalidateMoney(userId);

    log.info("Statement import committed", {
      userId,
      bank: input.bank,
      expenses: newExpenses.length,
      income: newIncome.length,
      skippedDuplicates,
    });

    return json({ created: newExpenses.length + newIncome.length, skippedDuplicates });
  }
);
