import { NextResponse } from "next/server";
import connectDB from "@/lib/mongoose";
import HabitLog from "@/models/HabitLog";
import { auth } from "@/lib/auth";

/** Normalise a 'YYYY-MM-DD' string to a UTC-midnight Date. */
function utcMidnight(dateStr) {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

/**
 * GET — habit logs for the past year (optionally filtered by ?habit=).
 */
export async function GET(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await connectDB();

  const { searchParams } = new URL(request.url);
  const habit = searchParams.get("habit");
  const since = new Date();
  since.setFullYear(since.getFullYear() - 1);

  const query = { userId: session.user.id, date: { $gte: since } };
  if (habit) query.habitName = habit;

  const logs = await HabitLog.find(query)
    .select("date completed value habitName note")
    .lean();
  return NextResponse.json(logs);
}

/**
 * POST — upsert a habit log for a given day.
 * Body: { habitName, date: 'YYYY-MM-DD', completed, value, unit, note }
 */
export async function POST(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await connectDB();
  const { habitName, date, completed, value, unit, note } =
    await request.json();

  if (!habitName || !date) {
    return NextResponse.json(
      { error: "habitName and date are required" },
      { status: 400 }
    );
  }

  try {
    const log = await HabitLog.findOneAndUpdate(
      { userId: session.user.id, habitName, date: utcMidnight(date) },
      {
        completed: Boolean(completed),
        ...(value !== undefined ? { value } : {}),
        ...(unit !== undefined ? { unit } : {}),
        ...(note !== undefined ? { note } : {}),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return NextResponse.json(log);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
