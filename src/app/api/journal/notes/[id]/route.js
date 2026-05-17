import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongoose";
import QuickNote from "@/models/QuickNote";

/**
 * PATCH /api/journal/notes/[id]
 * Inline-edit a note, toggle its pin, or change its type.
 * Body: { content?, pinned?, type? }
 */
export async function PATCH(request, { params }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { content, pinned, type } = await request.json();
  const update = {};
  if (typeof content === "string") {
    if (!content.trim()) {
      return NextResponse.json(
        { error: "Note content cannot be empty." },
        { status: 400 }
      );
    }
    update.content = content.trim();
  }
  if (typeof pinned === "boolean") update.pinned = pinned;
  if (typeof type === "string") update.type = type;

  await connectDB();
  const note = await QuickNote.findOneAndUpdate(
    { _id: params.id, userId: session.user.id },
    { $set: update },
    { new: true }
  ).lean();

  if (!note) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(note);
}

/** DELETE /api/journal/notes/[id] */
export async function DELETE(request, { params }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await connectDB();
  const res = await QuickNote.deleteOne({
    _id: params.id,
    userId: session.user.id,
  });
  if (!res.deletedCount) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
