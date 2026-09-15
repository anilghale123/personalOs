import { withRoute, json, badRequest, tooMany, ApiError } from "@/lib/api";
import { z, formatZodError } from "@/lib/validation";
import { rateLimitAll } from "@/lib/rate-limit";
import { requirePro } from "@/lib/entitlements";
import { log } from "@/lib/logger";
import { GROQ_CHAT_MODEL, describeAiError, getGroqClient, isAiConfigured } from "@/lib/groq";
import { parseVoiceTranscript } from "@/features/wealth/voice-parse";
import { TRANSFERS } from "@/features/wealth/categorize";
import { INCOME_CATEGORIES } from "@/features/wealth/constants";
import { DEFAULT_CATEGORIES } from "@/features/budget/constants";

export const runtime = "nodejs";
export const maxDuration = 30;

/** ~30 s of compressed speech is well under this. */
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
const WHISPER_MODEL = process.env.GROQ_WHISPER_MODEL || "whisper-large-v3-turbo";

const EXPENSE_NAMES = [...DEFAULT_CATEGORIES.map((c) => c.name), TRANSFERS];

const TranscriptBody = z.object({
  transcript: z.string().trim().min(1, "Say or type something first.").max(500),
});

const AiResult = z.object({
  amount: z.number().positive().max(1e10).nullable(),
  type: z.enum(["expense", "income"]),
  category: z.string().max(40).nullable().optional(),
  note: z.string().max(200).nullable().optional(),
});

/** Voice quota — shared by audio transcription and the AI fallback. */
async function spendVoiceQuota(userId) {
  const verdict = await rateLimitAll(userId, ["voice", "voiceDaily"], "parse-voice");
  if (!verdict.allowed) {
    throw tooMany(
      "You've used voice entry a lot today. Please type this one, or try again later.",
      verdict.retryAfterSec
    );
  }
}

async function transcribe(audio, userId) {
  try {
    const result = await getGroqClient().audio.transcriptions.create({
      file: audio,
      model: WHISPER_MODEL,
      response_format: "json",
      temperature: 0,
      // Biases spelling towards amounts and Nepali number words.
      prompt: "Money note, e.g. spent 500 on momo, income salary 35000, dui saya taxi, paanch hajar rent.",
    });
    return String(result?.text ?? "").trim();
  } catch (err) {
    log.warn("Voice transcription failed", { userId, status: err?.status });
    throw new ApiError(502, describeAiError(err).message, "stt_failed");
  }
}

/**
 * LLM extraction, only when the deterministic parser found no amount
 * ("paanch sayo pachas" style phrasing it does not know). Returns null on any
 * failure — the user can still fill the draft in by hand.
 */
async function extractWithAi(transcript) {
  const completion = await getGroqClient().chat.completions.create({
    model: GROQ_CHAT_MODEL,
    messages: [
      {
        role: "system",
        content:
          "Extract one money entry from a short spoken note (English, Nepali or Nepanglish). " +
          'Reply with only JSON: {"amount": number|null, "type": "expense"|"income", "category": string|null, "note": string|null}. ' +
          `Amount in NPR as digits. Expense categories: ${EXPENSE_NAMES.join(", ")}. ` +
          `Income categories: ${INCOME_CATEGORIES.join(", ")}. Use null when unsure; never invent an amount.`,
      },
      { role: "user", content: transcript },
    ],
    temperature: 0,
    max_tokens: 300,
    stream: false,
  });

  const content = completion.choices?.[0]?.message?.content ?? "";
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return null;
  const parsed = AiResult.safeParse(JSON.parse(match[0]));
  if (!parsed.success) return null;

  const { amount, type, category, note } = parsed.data;
  const allowed = type === "income" ? INCOME_CATEGORIES : EXPENSE_NAMES;
  return {
    amount,
    type,
    category: allowed.includes(category) ? category : null,
    note: note?.trim() || null,
  };
}

/**
 * POST /api/wealth/parse-voice — speech or text → a draft entry. Never saves.
 *
 * Either multipart/form-data with `audio` (transcribed with Groq Whisper), or
 * JSON `{ transcript }` (the browser's own speech recognition, or typed).
 *
 * → { transcript, parsed: { amount, type, category, note } }
 *
 * The client shows the draft for confirmation and saves through the normal
 * create-expense / create-income endpoints — parsing and saving are separate
 * calls on purpose, because transcripts are wrong often enough that nothing
 * should land without a human looking at it.
 */
export const POST = withRoute({ limit: "write", db: false }, async ({ userId, request }) => {
  // Voice entry is a Pro feature; free accounts never see the button.
  await requirePro(userId, "Voice entry is a Pro feature.");

  const contentType = request.headers.get("content-type") || "";
  let transcript;

  if (contentType.includes("multipart/form-data")) {
    if (!isAiConfigured) {
      throw new ApiError(503, "Voice transcription isn't available right now.", "stt_unavailable");
    }
    await spendVoiceQuota(userId);

    let form;
    try {
      form = await request.formData();
    } catch {
      throw badRequest("Expected an audio recording.");
    }
    const audio = form.get("audio");
    if (!audio || typeof audio === "string" || audio.size === 0) {
      throw badRequest("That recording was empty. Try again.");
    }
    if (audio.size > MAX_AUDIO_BYTES) {
      throw badRequest("That recording is too long. Keep it under 30 seconds.");
    }
    transcript = await transcribe(audio, userId);
  } else {
    let raw;
    try {
      raw = await request.json();
    } catch {
      throw badRequest("Expected a transcript.");
    }
    const body = TranscriptBody.safeParse(raw);
    if (!body.success) throw badRequest(formatZodError(body.error));
    transcript = body.data.transcript;
  }

  if (!transcript) {
    throw new ApiError(422, "We couldn't make out any words. Try again a little closer to the mic.", "empty_transcript");
  }

  let parsed = parseVoiceTranscript(transcript);

  if (parsed.amount == null && isAiConfigured) {
    await spendVoiceQuota(userId);
    const ai = await extractWithAi(transcript).catch((err) => {
      log.warn("Voice AI extraction failed", { userId, status: err?.status });
      return null;
    });
    if (ai?.amount != null) {
      parsed = {
        amount: ai.amount,
        type: ai.type,
        category: ai.category ?? parsed.category,
        note: ai.note ?? parsed.note,
      };
    }
  }

  return json({ transcript: transcript.slice(0, 500), parsed });
});
