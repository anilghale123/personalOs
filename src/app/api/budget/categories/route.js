import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongoose";
import Category from "@/models/Category";
import { CATEGORY_TYPES } from "@/features/budget/constants";

const TYPES = CATEGORY_TYPES.map((t) => t.id);

/** GET /api/budget/categories — all categories for the current user. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await connectDB();
  const categories = await Category.find({ userId: session.user.id })
    .sort({ sortOrder: 1, createdAt: 1 })
    .lean();
  return NextResponse.json(categories);
}

/**
 * POST /api/budget/categories — create a category (optionally a subcategory).
 * Body: { name, icon?, color?, type, parentId?, note? }
 */
export async function POST(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { name, icon, color, type, parentId, note } = await request.json();

  if (!name?.trim()) {
    return NextResponse.json({ error: "A category name is required." }, { status: 400 });
  }
  if (!TYPES.includes(type)) {
    return NextResponse.json({ error: "A valid category type is required." }, { status: 400 });
  }

  await connectDB();

  if (parentId) {
    const parent = await Category.findOne({ _id: parentId, userId: session.user.id }).lean();
    if (!parent) {
      return NextResponse.json({ error: "Parent category not found." }, { status: 400 });
    }
    if (parent.parentId) {
      return NextResponse.json(
        { error: "Subcategories can only be one level deep." },
        { status: 400 }
      );
    }
  }

  try {
    const category = await Category.create({
      userId: session.user.id,
      name: name.trim(),
      icon: icon || "🏷️",
      color: color || "#64748b",
      type,
      parentId: parentId || null,
      note: note?.trim() || undefined,
    });
    return NextResponse.json(category, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
