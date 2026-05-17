import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import connectDB from "@/lib/mongoose";
import User from "@/models/User";

/**
 * POST — register a new account.
 * Body: { name, email, password }
 */
export async function POST(request) {
  try {
    const { name, email, password } = await request.json();
    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Name, email and password are required." },
        { status: 400 }
      );
    }
    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters." },
        { status: 400 }
      );
    }

    await connectDB();
    const existing = await User.findOne({
      email: email.toLowerCase(),
    });
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email: email.toLowerCase(),
      passwordHash,
    });

    return NextResponse.json(
      { id: user._id.toString(), email: user.email, name: user.name },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Registration failed." },
      { status: 500 }
    );
  }
}
