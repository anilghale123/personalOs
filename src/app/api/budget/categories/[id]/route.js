import mongoose from "mongoose";
import { withRoute, json, badRequest, conflict, must } from "@/lib/api";
import { z, objectId, text, optionalText } from "@/lib/validation";
import { invalidateMoney } from "@/lib/cache";
import { log } from "@/lib/logger";
import Category from "@/models/Category";
import Expense from "@/models/Expense";
import { CATEGORY_TYPES } from "@/features/budget/constants";

const TYPES = CATEGORY_TYPES.map((t) => t.id);

const UpdateCategory = z
  .object({
    name: text(60).pipe(z.string().min(1, "Category name cannot be empty.")).optional(),
    icon: z.string().max(8).optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour.").optional(),
    type: z.enum(TYPES).optional(),
    note: optionalText(300),
    isArchived: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "Nothing to update.",
  });

/**
 * PATCH /api/budget/categories/[id]
 * Edit fields and/or archive/unarchive a category.
 * Body: { name?, icon?, color?, type?, note?, isArchived? }
 */
export const PATCH = withRoute(
  { limit: "write", params: ["id"], body: UpdateCategory },
  async ({ userId, params, input }) => {
    const update = Object.fromEntries(
      Object.entries(input).filter(([, v]) => v !== undefined)
    );

    const category = must(
      await Category.findOneAndUpdate(
        { _id: params.id, userId },
        { $set: update },
        { new: true, runValidators: true }
      ).lean()
    );

    // A type or colour change alters how spend is grouped and charted.
    invalidateMoney(userId);

    return json(category);
  }
);

const DeleteQuery = z.object({
  reassignTo: objectId.optional(),
  archive: z
    .string()
    .optional()
    .transform((v) => v === "true"),
});

/**
 * DELETE /api/budget/categories/[id]?reassignTo=<categoryId> | ?archive=true
 *
 * A category with expenses cannot simply vanish — the caller must either
 * reassign them or archive the category instead, which guarantees expenses
 * are never orphaned or silently deleted.
 *
 * The reassign path is now **atomic**. It was two writes with no transaction —
 * `updateMany` then `deleteOne` — so a failure between them left either
 * expenses pointing at a deleted category or a category that should have gone.
 * The route's own promise that expenses are never orphaned held only for the
 * happy path.
 */
export const DELETE = withRoute(
  { limit: "write", params: ["id"], query: DeleteQuery },
  async ({ userId, params, query }) => {
    const category = must(
      await Category.findOne({ _id: params.id, userId }).select("_id").lean()
    );

    const expenseCount = await Expense.countDocuments({
      userId,
      categoryId: params.id,
      deletedAt: null,
    });

    if (expenseCount > 0 && !query.reassignTo && !query.archive) {
      throw conflict(
        "This category has expenses. Reassign them to another category or archive this one instead.",
        { expenseCount }
      );
    }

    if (expenseCount > 0 && query.reassignTo) {
      if (String(query.reassignTo) === String(params.id)) {
        throw badRequest("Choose a different category to reassign to.");
      }
      const target = await Category.findOne({ _id: query.reassignTo, userId })
        .select("_id")
        .lean();
      if (!target) throw badRequest("Target category not found.");

      await reassignAndDelete({
        userId,
        fromId: params.id,
        toId: query.reassignTo,
      });

      invalidateMoney(userId);
      return json({ ok: true, archived: false, reassignedTo: query.reassignTo });
    }

    if (query.archive) {
      await Category.updateOne({ _id: params.id, userId }, { $set: { isArchived: true } });
      invalidateMoney(userId);
      return json({ ok: true, archived: true });
    }

    // No expenses reference this category — safe to delete outright.
    await Category.deleteOne({ _id: params.id, userId });
    invalidateMoney(userId);
    return json({ ok: true, archived: false });
  }
);

/**
 * Move every expense to a new category, then delete the old one, as one
 * all-or-nothing unit.
 *
 * Atlas replica sets support transactions; a standalone mongod does not. So
 * this tries a transaction and falls back to an ordering whose failure mode is
 * benign — reassign first, verify nothing is left, delete last. If the delete
 * fails there, the user sees a category that is empty rather than expenses
 * pointing at nothing, which is recoverable by retrying.
 */
async function reassignAndDelete({ userId, fromId, toId }) {
  let session;
  try {
    session = await mongoose.startSession();
  } catch {
    session = null;
  }

  if (session) {
    try {
      await session.withTransaction(async () => {
        await Expense.updateMany(
          { userId, categoryId: fromId },
          { $set: { categoryId: toId } },
          { session }
        );
        await Category.deleteOne({ _id: fromId, userId }, { session });
      });
      return;
    } catch (err) {
      // Transactions unsupported on this deployment — fall through rather
      // than failing the user's request.
      const unsupported =
        /Transaction numbers are only allowed|replica set|not supported/i.test(
          err?.message ?? ""
        );
      if (!unsupported) throw err;
      log.warn("Transactions unavailable; using ordered fallback", {
        operation: "category-reassign",
      });
    } finally {
      await session.endSession();
    }
  }

  // Ordered fallback: the safe order, then a verified delete.
  await Expense.updateMany(
    { userId, categoryId: fromId },
    { $set: { categoryId: toId } }
  );
  const remaining = await Expense.countDocuments({ userId, categoryId: fromId });
  if (remaining > 0) {
    throw badRequest(
      "Some expenses could not be reassigned. Nothing was deleted — please try again."
    );
  }
  await Category.deleteOne({ _id: fromId, userId });
}
