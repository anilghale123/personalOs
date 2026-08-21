import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongoose";
import QuickNote from "@/models/QuickNote";

/** POST /api/journal/notes/[id]/undo — restore a soft-deleted note. */
export async function POST(request, { params }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await connectDB();
  const note = await QuickNote.findOneAndUpdate(
    { _id: params.id, userId: session.user.id, deletedAt: { $ne: null } },
    { $set: { deletedAt: null } },
    { new: true }
  ).lean();
  if (!note) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(note);
}
