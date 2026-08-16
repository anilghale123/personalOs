import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongoose";
import Category from "@/models/Category";
import Expense from "@/models/Expense";
import { CATEGORY_TYPES } from "@/features/budget/constants";

const TYPES = CATEGORY_TYPES.map((t) => t.id);

/**
 * PATCH /api/budget/categories/[id]
 * Edit fields and/or archive/unarchive a category.
 * Body: { name?, icon?, color?, type?, note?, isArchived? }
 */
export async function PATCH(request, { params }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { name, icon, color, type, note, isArchived } = await request.json();

  const update = {};
  if (typeof name === "string") {
    if (!name.trim()) {
      return NextResponse.json({ error: "Category name cannot be empty." }, { status: 400 });
    }
    update.name = name.trim();
  }
  if (typeof icon === "string") update.icon = icon;
  if (typeof color === "string") update.color = color;
  if (typeof type === "string") {
    if (!TYPES.includes(type)) {
      return NextResponse.json({ error: "Invalid category type." }, { status: 400 });
    }
    update.type = type;
  }
  if (typeof note === "string") update.note = note.trim();
  if (typeof isArchived === "boolean") update.isArchived = isArchived;

  if (!Object.keys(update).length) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  await connectDB();
  const category = await Category.findOneAndUpdate(
    { _id: params.id, userId: session.user.id },
    { $set: update },
    { new: true, runValidators: true }
  ).lean();

  if (!category) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(category);
}

/**
 * DELETE /api/budget/categories/[id]?reassignTo=<categoryId> | ?archive=true
 * Refuses to delete a category with existing expenses unless the caller
 * has chosen to reassign them or archive the category instead — this
 * guarantees expenses are never orphaned or silently deleted.
 */
export async function DELETE(request, { params }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const reassignTo = searchParams.get("reassignTo");
  const archive = searchParams.get("archive") === "true";

  await connectDB();
  const category = await Category.findOne({ _id: params.id, userId: session.user.id });
  if (!category) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const expenseCount = await Expense.countDocuments({
    userId: session.user.id,
    categoryId: params.id,
    deletedAt: null,
  });

  if (expenseCount > 0 && !reassignTo && !archive) {
    return NextResponse.json(
      {
        error:
          "This category has expenses. Reassign them to another category or archive this one instead.",
        expenseCount,
      },
      { status: 409 }
    );
  }

  if (expenseCount > 0 && reassignTo) {
    const target = await Category.findOne({ _id: reassignTo, userId: session.user.id }).lean();
    if (!target) {
      return NextResponse.json({ error: "Target category not found." }, { status: 400 });
    }
    await Expense.updateMany(
      { userId: session.user.id, categoryId: params.id },
      { $set: { categoryId: reassignTo } }
    );
    await category.deleteOne();
    return NextResponse.json({ ok: true, archived: false, reassignedTo: reassignTo });
  }

  if (archive) {
    category.isArchived = true;
    await category.save();
    return NextResponse.json({ ok: true, archived: true });
  }

  // No expenses reference this category — safe to delete outright.
  await category.deleteOne();
  return NextResponse.json({ ok: true, archived: false });
}
