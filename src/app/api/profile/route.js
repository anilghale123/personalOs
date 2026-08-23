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
    .select("name email image provider passwordHash preferences")
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
    // Absent on accounts created before the preference existed, which
    // reads correctly as "off".
    journalExtraction: Boolean(user.preferences?.journalExtraction),
  });
}

/**
 * PATCH /api/profile — update display name and/or preferences.
 * Body: { name?, journalExtraction? }
 */
export async function PATCH(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));

  const update = {};
  if (body?.name !== undefined) {
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Name cannot be empty." }, { status: 400 });
    }
    update.name = body.name.trim();
  }
  // Turning journal analysis off stops all future extraction immediately;
  // the route that performs it checks this on every call.
  if (body?.journalExtraction !== undefined) {
    update["preferences.journalExtraction"] = Boolean(body.journalExtraction);
  }

  if (!Object.keys(update).length) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  await connectDB();
  const user = await User.findByIdAndUpdate(
    session.user.id,
    { $set: update },
    { new: true, runValidators: true }
  )
    .select("name email image provider preferences")
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
    journalExtraction: Boolean(user.preferences?.journalExtraction),
  });
}
