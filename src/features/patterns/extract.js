/**
 * Journal signal extraction — turning prose into a correlatable variable.
 *
 * This is the one place raw journal text reaches a language model as a
 * matter of routine, so two things are true by construction:
 *
 *   - It is **opt-in**. `User.preferences.journalExtraction` defaults to
 *     false and the route refuses without it.
 *   - It sends **one entry at a time**, never the corpus.
 *
 * The parsing is deliberately paranoid. Models wrap JSON in fences, add
 * commentary, invent enum values and return sentiment as a string — the
 * existing markdown renderer in the review screen already shows this
 * codebase expects imperfect LLM output, and the same scepticism applies
 * here. Anything that doesn't validate is discarded rather than stored,
 * because a wrong sentiment is worse than a missing one: the engine would
 * happily correlate against it.
 */

import { getGroqClient, GROQ_CHAT_MODEL } from "@/lib/groq";

const ENERGY_LEVELS = ["low", "medium", "high"];

/** Entries shorter than this carry no signal worth extracting. */
export const MIN_WORDS_FOR_EXTRACTION = 12;

/** §7.6 — the extraction prompt. */
export function buildExtractionPrompt(content) {
  return `Extract structured signals from one journal entry. Return ONLY valid JSON,
no markdown fences, no commentary.

ENTRY: ${content}

{
  "sentiment": <float -1.0 to 1.0>,
  "energy": "low" | "medium" | "high",
  "themes": [<up to 4 lowercase single words or short phrases>],
  "stressors": [<up to 3, or empty>]
}

Judge only what is written. Do not infer beyond the text. If the entry is
too short or ambiguous, return sentiment 0 and empty arrays.`;
}

/**
 * Parse and validate a model's extraction reply.
 *
 * @returns {{sentiment: number, energy: string|null, themes: string[], stressors: string[]}|null}
 *          null whenever anything is off — a discarded extraction is a
 *          non-event, a bad one silently corrupts every derived pattern.
 */
export function parseExtraction(raw) {
  const json = extractJsonObject(raw);
  if (!json) return null;

  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

  // Sentiment is the only field the engine correlates against, so it is
  // the only one whose absence invalidates the whole extraction.
  //
  // The coercion has to be explicit rather than `Number(...)`: null, ""
  // and false all coerce to 0, which is a *valid* sentiment meaning
  // "neutral day". Storing a declined or missing score as neutral would
  // hand the engine a fabricated reading of someone's day.
  const reported = parsed.sentiment;
  const sentiment =
    typeof reported === "number"
      ? reported
      : typeof reported === "string" && reported.trim() !== ""
        ? Number(reported)
        : NaN;
  if (!Number.isFinite(sentiment) || sentiment < -1 || sentiment > 1) return null;

  const energy = ENERGY_LEVELS.includes(parsed.energy) ? parsed.energy : null;

  return {
    sentiment: Math.round(sentiment * 100) / 100,
    energy,
    themes: cleanList(parsed.themes, 4),
    stressors: cleanList(parsed.stressors, 3),
  };
}

/**
 * Pull the first balanced `{...}` out of a reply.
 *
 * Handles the three things models actually do: fence the JSON, prefix it
 * with "Here's the JSON:", or append a closing remark.
 */
function extractJsonObject(raw) {
  const text = String(raw ?? "")
    .replace(/```(?:json)?/gi, "")
    .trim();
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth++;
    else if (char === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** Lowercase, trimmed, de-duplicated, capped strings. */
function cleanList(value, limit) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const clean = item.trim().toLowerCase().slice(0, 40);
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= limit) break;
  }
  return out;
}

/** Whitespace-delimited word count — the signal layer's definition. */
export function wordCount(text) {
  const trimmed = String(text ?? "").trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/**
 * Extract signals from one entry's text.
 *
 * @returns {Promise<object|null>} validated signals, or null if the entry
 *          is too short, the call failed, or the reply didn't validate.
 */
export async function extractJournalSignals(content) {
  if (wordCount(content) < MIN_WORDS_FOR_EXTRACTION) return null;

  try {
    const groq = getGroqClient();
    const completion = await groq.chat.completions.create({
      model: GROQ_CHAT_MODEL,
      messages: [{ role: "user", content: buildExtractionPrompt(content) }],
      // Low temperature: this is a labelling task, not a writing one.
      temperature: 0.1,
      max_tokens: 220,
      stream: false,
    });
    const parsed = parseExtraction(completion.choices?.[0]?.message?.content);
    if (!parsed) return null;
    return { ...parsed, extractedAt: new Date(), model: GROQ_CHAT_MODEL };
  } catch (err) {
    console.error("Journal extraction failed:", err.message);
    return null;
  }
}
