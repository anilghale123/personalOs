/**
 * Narration — the only place a language model touches this feature.
 *
 * The boundary is absolute and mechanical: the model receives numbers
 * that have already been computed and returns prose. It never sees raw
 * journal text or expense rows, never performs arithmetic, and never
 * decides whether a pattern is real — the engine settled that before this
 * module was called.
 *
 * Two guards enforce it rather than merely asking for it:
 *
 *   1. `assertNoInventedNumbers` rejects any output containing a figure
 *      that isn't in the input. "The AI made up a statistic" becomes
 *      structurally impossible instead of discouraged.
 *   2. `assertNoCausalClaims` rejects causal phrasing, using the same
 *      banned-term list the deterministic templates are tested against.
 *
 * On failure: retry once, then fall back to the template statement.
 * Narration is strictly additive — nothing in the product breaks without
 * it, which is why the feed never shows it and only the detail page does.
 */

import { getGroqClient, GROQ_CHAT_MODEL } from "@/lib/groq";
import { fromMinorUnits } from "@/lib/money";
import { BANNED_CAUSAL_TERMS } from "./constants";

/** Small integers a writer may spell out without it being a claim. */
const SPELLED_NUMBERS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  half: 0.5, twice: 2, double: 2, triple: 3,
};

/** Every numeric token in a piece of prose, commas and % stripped. */
export function extractNumbers(text) {
  const matches = String(text ?? "").match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
  return matches
    .map((token) => Number(token.replace(/,/g, "")))
    .filter((n) => Number.isFinite(n));
}

/**
 * Every number the model is permitted to use: the figures in the payload
 * plus the ones already rendered into the deterministic statement.
 *
 * Rupee equivalents of paisa amounts are included because the statement
 * speaks in rupees — the model reading "NPR 2,450" and writing "2,450"
 * has invented nothing.
 */
export function allowedNumbers(payload) {
  const out = new Set();
  const walk = (value) => {
    if (value === null || value === undefined) return;
    if (typeof value === "number" && Number.isFinite(value)) {
      out.add(value);
      out.add(Math.abs(value));
      // Money travels as paisa; prose says rupees.
      out.add(fromMinorUnits(value));
      out.add(Math.abs(fromMinorUnits(value)));
      return;
    }
    if (typeof value === "string") {
      extractNumbers(value).forEach((n) => out.add(n));
      return;
    }
    if (Array.isArray(value)) return value.forEach(walk);
    if (typeof value === "object") return Object.values(value).forEach(walk);
  };
  walk(payload);

  // Percentages the model can legitimately derive from a ratio it was
  // handed, e.g. an effect of 0.62 described as "62%".
  for (const n of [...out]) {
    if (Math.abs(n) <= 1) out.add(Math.round(n * 100));
  }
  return [...out];
}

/**
 * True when `value` is close enough to one of the allowed figures to be a
 * rounding of it rather than a new claim.
 *
 * Tolerance scales with magnitude: "62%" for 62.4 is fine, and so is
 * "NPR 2,450" for 2,449.6, but 70 for 62.4 is not.
 */
function isRoundingOf(value, allowed) {
  return allowed.some((a) => {
    if (a === value) return true;
    const scale = Math.max(Math.abs(a), 1);
    // 1% relative, or half a unit — whichever is more generous, which
    // covers both "62.4 → 62" and "2449.6 → 2450".
    return Math.abs(a - value) <= Math.max(scale * 0.01, 0.5);
  });
}

/**
 * Reject narration containing any number not present in the input.
 * @returns {{ok: boolean, invented: number[]}}
 */
export function assertNoInventedNumbers(output, allowed) {
  const invented = extractNumbers(output).filter((n) => !isRoundingOf(n, allowed));
  return { ok: invented.length === 0, invented };
}

/**
 * Reject narration that asserts causation.
 *
 * The same list the deterministic templates are held to — a sentence the
 * product would refuse to generate itself is not one it may launder
 * through a model.
 * @returns {{ok: boolean, terms: string[]}}
 */
export function assertNoCausalClaims(output) {
  const lower = String(output ?? "").toLowerCase();
  const terms = BANNED_CAUSAL_TERMS.filter((term) => lower.includes(term));
  return { ok: terms.length === 0, terms };
}

/**
 * The finished figures a model is allowed to see.
 *
 * Deliberately narrow: no evidence points, no dates, no journal text, no
 * expense rows. Just the shape of the finding.
 */
export function narrationPayload(insight) {
  const groups = insight?.evidence?.groups;
  return {
    statement: insight?.statement ?? null,
    domains: insight?.domains ?? [],
    direction: insight?.direction ?? null,
    daysMeasured: insight?.n ?? null,
    effectSize: round(insight?.effect?.standardised),
    effectUnit: insight?.effect?.unit ?? null,
    confidence: insight?.confidence ?? null,
    timesConfirmed: insight?.timesConfirmed ?? 1,
    groups:
      groups && !Array.isArray(groups)
        ? {
            a: summariseGroup(groups.a, insight?.effect?.unit),
            b: summariseGroup(groups.b, insight?.effect?.unit),
          }
        : null,
  };
}

function summariseGroup(group, unit) {
  if (!group) return null;
  const toUnit = (v) =>
    unit === "paisa" ? Math.round(fromMinorUnits(v ?? 0)) : round(v);
  return {
    label: group.label,
    days: group.n,
    typical: toUnit(group.median),
    average: toUnit(group.mean),
  };
}

function round(value) {
  return typeof value === "number" ? Number(value.toFixed(2)) : null;
}

/** §7.3 — state the finding in plain language, and nothing more. */
export function buildNarrationPrompt(payload) {
  return `You explain a statistical finding about one person's own life data.

FINDING (already computed — do not recalculate anything):
${JSON.stringify(payload, null, 2)}

Write 2-3 sentences that:
- State what was found, in plain language
- Use ONLY numbers present in the finding above
- Describe association, never causation. Use "tends to", "on days when",
  "moves alongside". Never "causes", "makes", "leads to", "because of"
- Are neutral and non-judgemental. This is the user's own life; do not
  moralise about spending, mood, or missed habits
- Do not give advice unless the finding is a forward-looking one
- Do not open with "Interestingly" or "It appears that"

Output plain prose. No headings, no bullets, no preamble.`;
}

/** Words that mark a sentence as a possibility rather than a claim. */
const HEDGE_MARKERS = [
  "might", "may ", "could", "perhaps", "possible", "possibly",
  "one explanation", "another explanation", "it's also", "it is also",
  "tends to", "sometimes", "often", "may also",
];

/**
 * The explanation role is *supposed* to raise causal mechanisms — that is
 * the whole point of it — so the banned-verb list would be the wrong
 * guard here and would reject perfectly honest hedged prose. What matters
 * instead is that every mechanism is offered as a possibility.
 *
 * @returns {{ok: boolean}}
 */
export function assertHedged(output) {
  const lower = String(output ?? "").toLowerCase();
  return { ok: HEDGE_MARKERS.some((marker) => lower.includes(marker)) };
}

/**
 * §7.4 — "why might this be?"
 *
 * The requirement to always include a reverse-causation candidate is a
 * deliberate epistemics guard: without it, an explanation feature quietly
 * becomes a causation-assertion feature.
 */
export function buildExplanationPrompt(insight) {
  return `A statistical association was found in one person's data:
${insight.statement} (n=${insight.n}, confidence: ${insight.confidence})

Offer 2-3 plausible everyday explanations for why two things like this
might move together. Rules:
- Present these explicitly as possibilities, not conclusions
- Include at least one explanation where the causation runs the OTHER way
- Include the possibility that a third factor explains both
- Never assert which is correct
- No advice, no numbers, under 120 words`;
}

/**
 * Ask Groq for prose, and refuse anything that fails the guards.
 *
 * One retry, then null — and null means the caller keeps showing the
 * deterministic template, which was always the load-bearing sentence.
 *
 * @returns {Promise<{text: string, model: string}|null>}
 */
export async function generateNarration(insight, { attempts = 2 } = {}) {
  const payload = narrationPayload(insight);
  const allowed = allowedNumbers(payload);
  const prompt = buildNarrationPrompt(payload);

  for (let attempt = 0; attempt < attempts; attempt++) {
    const text = await askGroq(prompt, 260);
    if (!text) continue;

    const numbers = assertNoInventedNumbers(text, allowed);
    const causal = assertNoCausalClaims(text);
    if (numbers.ok && causal.ok) return { text, model: GROQ_CHAT_MODEL };

    console.warn("Narration rejected", {
      insight: insight?.id,
      invented: numbers.invented,
      causalTerms: causal.terms,
    });
  }
  return null;
}

/**
 * The "why might this be?" prose.
 *
 * Guarded on hedging rather than on causal verbs, and on carrying no
 * numbers at all — it was asked for none, so any figure in it would be
 * invented by definition.
 *
 * @returns {Promise<{text: string, model: string}|null>}
 */
export async function generateExplanation(insight, { attempts = 2 } = {}) {
  const prompt = buildExplanationPrompt(insight);

  for (let attempt = 0; attempt < attempts; attempt++) {
    const text = await askGroq(prompt, 300);
    if (!text) continue;
    if (assertHedged(text).ok && assertNoInventedNumbers(text, []).ok) {
      return { text, model: GROQ_CHAT_MODEL };
    }
  }
  return null;
}

/** One Groq call, returning trimmed prose or null. */
async function askGroq(prompt, maxTokens) {
  try {
    const groq = getGroqClient();
    const completion = await groq.chat.completions.create({
      model: GROQ_CHAT_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
      max_tokens: maxTokens,
      stream: false,
    });
    const text = completion.choices?.[0]?.message?.content?.trim();
    return text || null;
  } catch (err) {
    console.error("Groq narration call failed:", err.message);
    return null;
  }
}
