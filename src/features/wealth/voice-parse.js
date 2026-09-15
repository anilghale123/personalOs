/**
 * Turn a spoken sentence into a draft money entry.
 *
 *   "spent 500 on momo"          → { amount: 500,   type: "expense", category: "Eating Out", note: "Momo" }
 *   "income salary 35000"        → { amount: 35000, type: "income",  category: "Salary",     note: "Salary" }
 *   "five thousand for rent"     → { amount: 5000,  type: "expense", category: "Rent/Housing" }
 *   "dui saya taxi"              → { amount: 200,   type: "expense", category: "Transport" }
 *
 * Deterministic and pure, so it is instant, free, testable, and works when
 * the AI provider is down. The API route falls back to an LLM only when this
 * cannot find an amount. Nothing parsed here is ever saved without the user
 * confirming it — transcripts are unreliable.
 */

import { suggestExpenseCategory, suggestIncomeCategory } from "./categorize";

const UNITS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  // Nepali / Nepenglish — best effort, as Whisper and browsers romanise it.
  ek: 1, dui: 2, tin: 3, teen: 3, char: 4, chaar: 4, panch: 5, paanch: 5, pach: 5, paach: 5,
  chha: 6, chhe: 6, saat: 7, aath: 8, nau: 9, das: 10, bis: 20, tis: 30, chalis: 40,
  pachas: 50, pachaas: 50, sathi: 60, sattari: 70, assi: 80, nabbe: 90,
};

const MULTIPLIERS = {
  hundred: 100, saya: 100, sae: 100, sau: 100,
  thousand: 1_000, k: 1_000, hajar: 1_000, hazar: 1_000, hajaar: 1_000, hazaar: 1_000,
  lakh: 100_000, lakhs: 100_000, lac: 100_000, lacs: 100_000,
  million: 1_000_000, crore: 10_000_000, karod: 10_000_000,
};

const CURRENCY = new Set(["rs", "rs.", "npr", "rupees", "rupee", "rupiya", "rupaiya", "rupaiyan", "nrs"]);

const INCOME_WORDS = /\b(income|salary|earned|earn|received|receive|credited|deposit|deposited|refund|refunded|bonus|talab|kamaye|kamayo|got paid)\b/;
const EXPENSE_WORDS = /\b(spent|spend|spending|paid|pay|bought|buy|expense|kharcha|kharch|tireko|tiryo|cost)\b/;

/** Words that carry no meaning for the note once amount and type are known. */
const FILLER = new Set([
  "i", "i've", "ive", "have", "has", "just", "today", "spent", "spend", "paid", "pay", "for", "on",
  "at", "of", "the", "a", "an", "and", "bought", "buy", "expense", "income", "got", "received",
  "earned", "kharcha", "kharch", "ma", "lagi", "cost", "costs", "was", "is", "it", "add", "my",
]);

/** Normalise punctuation and split "5k" / "1,500" into parseable tokens. */
function tokenize(text) {
  return String(text)
    .toLowerCase()
    .replace(/(\d),(?=\d)/g, "$1")
    .replace(/(\d)(k|lakh|lac)\b/g, "$1 $2")
    .replace(/[^\p{L}\p{N}.'\s-]/gu, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^[.'-]+|[.'-]+$/g, ""))
    .filter(Boolean);
}

/**
 * Read one run of number tokens starting at `i` — digits, words, or a mix
 * ("2 thousand 500", "two thousand five hundred", "dui saya").
 * @returns {{value: number, start: number, end: number}|null}
 */
function readNumber(tokens, i) {
  let total = 0;
  let current = 0;
  let used = false;
  let j = i;

  for (; j < tokens.length; j++) {
    const t = tokens[j];
    if (/^\d+(\.\d+)?$/.test(t)) {
      if (current) break; // "500 200" is two numbers, not one
      current = parseFloat(t);
      used = true;
    } else if (t in UNITS) {
      current += UNITS[t];
      used = true;
    } else if ((t === "a" || t === "an") && !used && tokens[j + 1] in MULTIPLIERS) {
      current = 1;
      used = true;
    } else if (t in MULTIPLIERS && used) {
      const m = MULTIPLIERS[t];
      if (m === 100) current = (current || 1) * 100;
      else {
        total += (current || 1) * m;
        current = 0;
      }
    } else if (t === "and" && used && j + 1 < tokens.length && (tokens[j + 1] in UNITS || /^\d/.test(tokens[j + 1]))) {
      continue;
    } else {
      break;
    }
  }

  return used ? { value: total + current, start: i, end: j } : null;
}

/** Every number run in the sentence, left to right. */
function findNumbers(tokens) {
  const runs = [];
  for (let i = 0; i < tokens.length; ) {
    const run = readNumber(tokens, i);
    if (run && run.end > i) {
      runs.push(run);
      i = run.end;
    } else {
      i++;
    }
  }
  return runs;
}

function detectType(text) {
  const income = text.search(INCOME_WORDS);
  const expense = text.search(EXPENSE_WORDS);
  if (income === -1) return "expense";
  if (expense === -1) return "income";
  // Both present ("paid rent from salary") — the leading verb decides.
  return income < expense ? "income" : "expense";
}

/**
 * @param {string} transcript
 * @returns {{amount: number|null, type: 'expense'|'income', category: string|null, note: string|null}}
 */
export function parseVoiceTranscript(transcript) {
  const raw = String(transcript ?? "").trim();
  const lower = raw.toLowerCase();
  const tokens = tokenize(raw);
  const runs = findNumbers(tokens).filter((r) => r.value > 0);

  // Prefer the number next to a currency word ("rs 500", "500 rupees");
  // otherwise the first one, which is how people phrase amounts.
  const chosen =
    runs.find((r) => CURRENCY.has(tokens[r.start - 1]) || CURRENCY.has(tokens[r.end])) ??
    runs[0] ??
    null;

  const type = detectType(lower);

  const noteTokens = tokens.filter((t, idx) => {
    if (chosen && idx >= chosen.start && idx < chosen.end) return false;
    return !CURRENCY.has(t) && !FILLER.has(t);
  });
  const noteText = noteTokens.join(" ").trim();
  const note = noteText ? noteText.charAt(0).toUpperCase() + noteText.slice(1) : null;

  const amount = chosen ? Math.round(chosen.value * 100) / 100 : null;

  return {
    amount,
    type,
    category: type === "income" ? suggestIncomeCategory(lower) : suggestExpenseCategory(lower),
    note: note ? note.slice(0, 200) : null,
  };
}
