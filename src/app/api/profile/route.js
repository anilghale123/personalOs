import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongoose";
import User from "@/models/User";

/** GET /api/profile — the current user's profile details. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await connectDB();
  const user = await User.findById(session.user.id)
    .select("name email image provider passwordHash")
    .lean();
  if (!user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({
    id: String(user._id),
    name: user.name,
    email: user.email,
    image: user.image,
    provider: user.provider,
    hasPassword: Boolean(user.passwordHash),
  });
}

/**
 * PATCH /api/profile — update display name.
 * Body: { name }
 */
export async function PATCH(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { name } = await request.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: "Name cannot be empty." }, { status: 400 });
  }

  await connectDB();
  const user = await User.findByIdAndUpdate(
    session.user.id,
    { $set: { name: name.trim() } },
    { new: true, runValidators: true }
  )
    .select("name email image provider")
    .lean();

  if (!user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({
    id: String(user._id),
    name: user.name,
    email: user.email,
    image: user.image,
    provider: user.provider,
  });
}
