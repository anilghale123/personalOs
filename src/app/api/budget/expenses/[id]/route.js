import { withRoute, json, badRequest, must } from "@/lib/api";
import {
  z,
  amountMajor,
  dateKey,
  optionalDateKey,
  objectId,
  optionalText,
  tagList,
} from "@/lib/validation";
import { invalidateMoney } from "@/lib/cache";
import Expense from "@/models/Expense";
import Category from "@/models/Category";
import { PAYMENT_METHODS, RECURRENCE_FREQUENCIES } from "@/features/budget/constants";
import { toExpenseDTO } from "@/features/budget/dto";

const PAYMENT_IDS = PAYMENT_METHODS.map((p) => p.id);
const FREQ_IDS = RECURRENCE_FREQUENCIES.map((f) => f.id);

const UpdateExpense = z
  .object({
    amount: amountMajor.optional(),
    categoryId: objectId.optional(),
    date: optionalDateKey,
    note: optionalText(500),
    paymentMethod: z.enum(PAYMENT_IDS).optional(),
    tags: tagList.optional(),
    isRecurring: z.boolean().optional(),
    recurrence: z
      .object({
        frequency: z.enum(FREQ_IDS),
        dayOfMonth: z.coerce.number().int().min(1).max(31).optional(),
        weekday: z.coerce.number().int().min(0).max(6).optional(),
        nextRunDate: dateKey.optional(),
      })
      .optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "Nothing to update.",
  });

/**
 * PATCH /api/budget/expenses/[id]
 * Body: any subset of { amount, categoryId, date, note, paymentMethod, tags,
 *                       isRecurring, recurrence }
 */
export const PATCH = withRoute(
  { limit: "write", params: ["id"], body: UpdateExpense },
  async ({ userId, params, input }) => {
    const update = {};

    if (input.amount !== undefined) update.amountPaisa = input.amount;
    if (input.date !== undefined) update.date = input.date;
    if (input.note !== undefined) update.note = input.note;
    if (input.paymentMethod !== undefined) update.paymentMethod = input.paymentMethod;
    if (input.tags !== undefined) update.tags = input.tags;

    if (input.categoryId !== undefined) {
      // Scoped by userId, so someone else's category id reads as not found.
      const category = await Category.findOne({ _id: input.categoryId, userId })
        .select("_id")
        .lean();
      if (!category) throw badRequest("Category not found.");
      update.categoryId = input.categoryId;
    }

    if (input.isRecurring !== undefined) {
      update.isRecurring = input.isRecurring;
      if (!input.isRecurring) update.recurrence = undefined;
    }
    if (input.recurrence !== undefined) update.recurrence = input.recurrence;

    const expense = must(
      await Expense.findOneAndUpdate(
        { _id: params.id, userId, deletedAt: null },
        { $set: update },
        { new: true, runValidators: true }
      ).lean()
    );

    invalidateMoney(userId);

    return json(toExpenseDTO(expense));
  }
);

/** DELETE /api/budget/expenses/[id] — soft delete, restorable via the undo toast. */
export const DELETE = withRoute(
  { limit: "write", params: ["id"] },
  async ({ userId, params }) => {
    const expense = must(
      await Expense.findOneAndUpdate(
        { _id: params.id, userId, deletedAt: null },
        { $set: { deletedAt: new Date() } },
        { new: true }
      ).lean()
    );

    invalidateMoney(userId);

    return json(toExpenseDTO(expense));
  }
);
