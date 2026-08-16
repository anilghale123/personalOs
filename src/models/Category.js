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

export default mongoose.models.Category ||
  mongoose.model("Category", CategorySchema);
