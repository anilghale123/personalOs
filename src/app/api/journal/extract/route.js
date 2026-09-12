import { withRoute, json } from "@/lib/api";
import { z, dateKey } from "@/lib/validation";
import { invalidateJournal } from "@/lib/cache";
import { isAiConfigured } from "@/lib/groq";
import DailyJournal from "@/models/DailyJournal";
import User from "@/models/User";
import {
  extractJournalSignals,
  wordCount,
  MIN_WORDS_FOR_EXTRACTION,
} from "@/features/patterns/extract";

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
 * One entry per call, never the corpus. Rate limited like every other AI
 * endpoint — `force` bypasses the idempotency check, not the cost.
 */
export const POST = withRoute(
  {
    limit: ["ai", "aiDaily"],
    body: z.object({ date: dateKey, force: z.boolean().optional() }),
  },
  async ({ userId, input }) => {
    const { date, force } = input;

    if (!isAiConfigured) {
      return json({ extracted: false, reason: "unavailable" });
    }

    const user = await User.findById(userId).select("preferences").lean();
    if (!user?.preferences?.journalExtraction) {
      return json({
        extracted: false,
        reason: "opted_out",
        message: "Journal analysis is off. You can turn it on in your profile.",
      });
    }

    const journal = await DailyJournal.findOne({ userId, date })
      .select("content signals")
      .lean();

    if (
      !journal?.content ||
      wordCount(journal.content) < MIN_WORDS_FOR_EXTRACTION
    ) {
      return json({
        extracted: false,
        reason: "too_short",
        minWords: MIN_WORDS_FOR_EXTRACTION,
      });
    }

    // Idempotent by default: re-extracting unchanged text costs tokens and
    // produces the same answer, so the backfill can be re-run safely.
    if (journal.signals?.extractedAt && !force) {
      return json({ extracted: false, reason: "already_extracted" });
    }

    const signals = await extractJournalSignals(journal.content);
    if (!signals) {
      // A refused or unparseable extraction leaves the document untouched.
      // A missing sentiment costs nothing; a fabricated one would be
      // correlated against as though it were real.
      return json({ extracted: false, reason: "unavailable" });
    }

    await DailyJournal.updateOne({ userId, date }, { $set: { signals } });

    // Sentiment feeds the pattern engine, so the signal cache is now stale.
    invalidateJournal(userId);

    return json({
      extracted: true,
      signals: {
        sentiment: signals.sentiment,
        energy: signals.energy,
        themes: signals.themes,
        stressors: signals.stressors,
      },
    });
  }
);
