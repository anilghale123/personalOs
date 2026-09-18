import mongoose from "mongoose";

const CategorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    icon: { type: String, default: "🏷️" }, // emoji
    color: { type: String, default: "#64748b" }, // hex — used by charts + swatches
    type: {
      type: String,
      enum: ["need", "want", "savings"],
      required: true,
    },
    // One level deep only — a category with a parentId cannot itself be a parent.
    // Enforced in the action/route layer, not the schema.
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },
    note: String,
    isArchived: { type: Boolean, default: false },
    isDefault: { type: Boolean, default: false }, // seeded on first load, not user-created
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

CategorySchema.index({ userId: 1, isArchived: 1 });
CategorySchema.index({ userId: 1, parentId: 1 });
// One name per level per user, compared case-insensitively ("Food" == "food").
// This is what stops concurrent first-load seeding from creating the default
// set twice. Existing duplicates must be merged first — see
// scripts/dedupe-categories.mjs — or the index build fails.
CategorySchema.index(
  { userId: 1, parentId: 1, name: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } }
);

/** The collation the unique name index uses — pass it to name lookups. */
export const CATEGORY_NAME_COLLATION = { locale: "en", strength: 2 };

export default mongoose.models.Category ||
  mongoose.model("Category", CategorySchema);
