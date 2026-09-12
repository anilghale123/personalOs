import { withRoute, json, badRequest, ApiError } from "@/lib/api";
import { z, dateKey } from "@/lib/validation";
import {
  GROQ_CHAT_MODEL,
  describeAiError,
  getGroqClient,
  isAiConfigured,
} from "@/lib/groq";
import { invalidateJournal } from "@/lib/cache";
import { captureException } from "@/lib/logger";
import DailyJournal from "@/models/DailyJournal";
import QuickNote from "@/models/QuickNote";

/** Cap what we send to the model — cost and latency both scale with it. */
const MAX_PROMPT_NOTES = 40;
const MAX_NOTE_CHARS = 300;
const MAX_CONTENT_CHARS = 6000;

/**
 * POST /api/journal/reflect
 *
 * Generates a short, warm AI reflection for a single day from its anchor
 * journal + quick notes, and persists it as `aiSummary`.
 *
 * Rate limited on an hourly *and* a daily cap. Every call spends money against
 * a quota shared by every user, so one person in a loop could previously drain
 * AI features for everybody.
 *
 * Body: { date }
 */
export const POST = withRoute(
  { limit: ["ai", "aiDaily"], body: z.object({ date: dateKey }) },
  async ({ userId, input }) => {
    const { date } = input;

    if (!isAiConfigured) {
      throw badRequest("AI reflections are not available right now.");
    }

    const [journal, notes] = await Promise.all([
      DailyJournal.findOne({ userId, date }),
      QuickNote.find({ userId, date, deletedAt: null })
        .sort({ createdAt: 1 })
        .limit(MAX_PROMPT_NOTES)
        .lean(),
    ]);

    const content = journal?.content?.trim() ?? "";
    if (!content && notes.length === 0) {
      throw badRequest("Nothing to reflect on yet — write a little first.");
    }

    const noteLines = notes.length
      ? notes.map((n) => `- "${n.content.slice(0, MAX_NOTE_CHARS)}"`).join("\n")
      : "(none)";

    const prompt = `You are a calm, supportive journaling companion. Reflect on this single day with warmth and zero judgement.

DATE: ${date}
Mood: ${journal?.mood || "unset"}

Daily Reflection:
"${content.slice(0, MAX_CONTENT_CHARS) || "(no long-form entry)"}"

Quick Notes:
${noteLines}

Write a SHORT reflection (3-4 sentences, under 90 words). Gently name the emotional thread of the day, acknowledge one thing that went well, and offer one soft, encouraging nudge. Speak directly to the person ("you"). Do not use headings or bullet points.`;

    let aiSummary;
    try {
      const groq = getGroqClient();
      const completion = await groq.chat.completions.create({
        model: GROQ_CHAT_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 220,
      });
      aiSummary = completion.choices?.[0]?.message?.content?.trim();
      if (!aiSummary) throw new Error("Empty completion from the model.");
    } catch (err) {
      /**
       * The raw SDK error names the provider, the model, and sometimes the
       * prompt — which here is the user's own journal entry. Log it in full
       * (the logger redacts content), and hand the user only the part that
       * tells them what to do next.
       */
      captureException(err, { operation: "journal-reflect", userId });
      const { message, retryable } = describeAiError(err);
      throw new ApiError(retryable ? 503 : 500, message, "ai_unavailable");
    }

    // Upsert so a day with notes but no anchor entry still gets its summary.
    await DailyJournal.findOneAndUpdate(
      { userId, date },
      { $set: { aiSummary }, $setOnInsert: { userId, date } },
      { upsert: true, setDefaultsOnInsert: true }
    );

    invalidateJournal(userId);

    return json({ aiSummary });
  }
);
