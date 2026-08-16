import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongoose";
import User from "@/models/User";

/**
 * PATCH /api/profile/password — change (or set) the account password.
 *
 * Passwords are stored as one-way bcrypt hashes, so an existing password
 * can never be "revealed" — only replaced. Accounts that signed up with
 * Google have no password yet, so `currentPassword` is only required
 * when one already exists; otherwise this sets the first one, letting
 * a Google-only account add credentials login as a backup.
 * Body: { currentPassword?, newPassword }
 */
export async function PATCH(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { currentPassword, newPassword } = await request.json();

  if (!newPassword || newPassword.length < 6) {
    return NextResponse.json(
      { error: "New password must be at least 6 characters." },
      { status: 400 }
    );
  }

  await connectDB();
  const user = await User.findById(session.user.id);
  if (!user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (user.passwordHash) {
    if (!currentPassword) {
      return NextResponse.json(
        { error: "Enter your current password to change it." },
        { status: 400 }
      );
    }
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
    }
  }

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  await user.save();

  return NextResponse.json({ ok: true });
}
