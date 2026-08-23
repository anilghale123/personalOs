import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongoose";
import DailyJournal from "@/models/DailyJournal";
import User from "@/models/User";
import { extractJournalSignals, wordCount, MIN_WORDS_FOR_EXTRACTION } from "@/features/patterns/extract";

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * POST /api/journal/extract — derive structured signals from one entry.
 *
 * Body: { date: 'YYYY-MM-DD', force?: boolean }
 *
 * Opt-in only. `User.preferences.journalExtraction` defaults to false and
 * this route refuses without it, because continuous journal text leaving
 * the device is a materially different privacy proposition from the
 * occasional reflection the user asks for by pressing a button.
 *
 * One entry per call, never the corpus.
 */
export async function POST(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const date = body?.date;
  if (!DATE_KEY.test(date ?? "")) {
    return NextResponse.json({ error: "A valid date is required." }, { status: 400 });
  }

  await connectDB();
  const userId = session.user.id;

  const user = await User.findById(userId).select("preferences").lean();
  if (!user?.preferences?.journalExtraction) {
    return NextResponse.json(
      {
        extracted: false,
        reason: "opted_out",
        message: "Journal analysis is off. You can turn it on in your profile.",
      },
      { status: 200 }
    );
  }

  const journal = await DailyJournal.findOne({ userId, date })
    .select("content signals")
    .lean();

  if (!journal?.content || wordCount(journal.content) < MIN_WORDS_FOR_EXTRACTION) {
    return NextResponse.json(
      { extracted: false, reason: "too_short", minWords: MIN_WORDS_FOR_EXTRACTION },
      { status: 200 }
    );
  }

  // Idempotent by default: re-extracting unchanged text costs tokens and
  // produces the same answer, so the backfill can be re-run safely.
  if (journal.signals?.extractedAt && !body?.force) {
    return NextResponse.json({ extracted: false, reason: "already_extracted" });
  }

  const signals = await extractJournalSignals(journal.content);
  if (!signals) {
    // A refused or unparseable extraction leaves the document untouched.
    // A missing sentiment costs nothing; a fabricated one would be
    // correlated against as though it were real.
    return NextResponse.json({ extracted: false, reason: "unavailable" }, { status: 200 });
  }

  await DailyJournal.updateOne({ userId, date }, { $set: { signals } });

  return NextResponse.json({
    extracted: true,
    signals: {
      sentiment: signals.sentiment,
      energy: signals.energy,
      themes: signals.themes,
      stressors: signals.stressors,
    },
  });
}
