import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    // Optional — OAuth (Google) accounts have no local password.
    passwordHash: { type: String },
    image: String,
    provider: {
      type: String,
      enum: ["credentials", "google"],
      default: "credentials",
    },
    /**
     * Additive and optional — documents written before this existed
     * simply lack it, and `journalExtraction` is read as opt-in.
     *
     * Journal text already reaches Groq through the reflect and briefing
     * routes, but extraction makes that systematic and continuous. Some
     * people will want the pattern engine and not text analysis, and
     * that is a reasonable position to support.
     */
    preferences: {
      journalExtraction: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

export default mongoose.models.User || mongoose.model("User", UserSchema);
