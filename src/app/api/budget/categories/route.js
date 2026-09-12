import { withRoute, json, badRequest } from "@/lib/api";
import { z, optionalObjectId, text, optionalText } from "@/lib/validation";
import { cachedReference, invalidateMoney, tags } from "@/lib/cache";
import Category from "@/models/Category";
import { CATEGORY_TYPES } from "@/features/budget/constants";

const TYPES = CATEGORY_TYPES.map((t) => t.id);

/** A hex colour, so a swatch or chart can never be handed arbitrary CSS. */
const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour.")
  .optional();

/**
 * GET /api/budget/categories — all categories for the current user.
 *
 * Tier-2 cached: a category list changes rarely but is read on every money
 * screen, and every expense row needs it to render an icon and colour.
 */
export const GET = withRoute({ limit: "read" }, async ({ userId }) => {
  const categories = await cachedReference(
    () =>
      Category.find({ userId })
        .sort({ sortOrder: 1, createdAt: 1 })
        .lean(),
    {
      userId,
      key: "categories",
      tags: [tags.categories(userId)],
    }
  );
  return json(categories);
});

const CreateCategory = z.object({
  name: text(60).pipe(z.string().min(1, "A category name is required.")),
  icon: z.string().max(8).optional(),
  color: hexColor,
  type: z.enum(TYPES, { message: "A valid category type is required." }),
  parentId: optionalObjectId,
  note: optionalText(300),
});

/**
 * POST /api/budget/categories — create a category (optionally a subcategory).
 * Body: { name, icon?, color?, type, parentId?, note? }
 */
export const POST = withRoute(
  { limit: "write", body: CreateCategory },
  async ({ userId, input }) => {
    if (input.parentId) {
      const parent = await Category.findOne({ _id: input.parentId, userId })
        .select("parentId")
        .lean();
      if (!parent) throw badRequest("Parent category not found.");
      // One level only — enforced here rather than in the schema, as the
      // model's own comment notes.
      if (parent.parentId) {
        throw badRequest("Subcategories can only be one level deep.");
      }
    }

    const category = await Category.create({
      userId,
      name: input.name,
      icon: input.icon || "🏷️",
      color: input.color || "#64748b",
      type: input.type,
      parentId: input.parentId || null,
      note: input.note,
    });

    invalidateMoney(userId);

    return json(category, { status: 201 });
  }
);
